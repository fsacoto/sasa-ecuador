import { FirebaseError } from 'firebase/app';
import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  getStorage,
  UploadTaskSnapshot,
  type FirebaseStorage,
} from 'firebase/storage';
import app, { auth, storage } from '../utils/firebase';

/** After a successful upload via the alternate default bucket, keep using it for deletes/uploads in this session. */
let sessionStorageInstance: FirebaseStorage | null = null;

function normalizeEnvBucket(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  if (!raw) return undefined;
  return raw.startsWith('gs://') ? raw.slice(5) : raw;
}

/**
 * When NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is unset, the JS SDK targets
 * project-id.appspot.com. New Firebase projects often only have
 * project-id.firebasestorage.app — uploads then fail with storage/unknown.
 * Retry uses the other default hostname when the bucket matches the project defaults.
 */
function alternateStoragesForUploadRetry(): FirebaseStorage[] {
  const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!pid || typeof window === 'undefined') return [];

  const configured = normalizeEnvBucket();
  const isProjectDefault =
    !configured ||
    configured === `${pid}.appspot.com` ||
    configured === `${pid}.firebasestorage.app`;

  if (!isProjectDefault) return [];

  const alts: FirebaseStorage[] = [];
  const pushHost = (host: string) => {
    if (configured === host) return;
    if (!configured && host === `${pid}.appspot.com`) return;
    try {
      alts.push(getStorage(app, `gs://${host}`));
    } catch {
      /* ignore invalid bucket */
    }
  };

  pushHost(`${pid}.firebasestorage.app`);
  pushHost(`${pid}.appspot.com`);

  return alts;
}

async function ensureAuthReadyForStorage(): Promise<void> {
  if (typeof window === 'undefined') return;
  const authMs = 45_000;
  await withTimeout(
    (async () => {
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!user) {
        throw new FirebaseError(
          'storage/unauthenticated',
          'You must be signed in to upload or delete files in Storage.'
        );
      }
      await user.getIdToken();
    })(),
    authMs,
    'Authentication timed out while preparing upload. Sign out and sign in again, then retry.'
  );
}

/** Avoid indefinite hangs when the network or Firebase never completes. */
function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      }
    );
  });
}

/** Longer for big files; caps avoid waiting forever on stalled uploads. */
function uploadTimeoutMsForFile(file: File): number {
  const mb = file.size / (1024 * 1024);
  // ~12s per MB (slow link), min 3m, max 30m
  return Math.min(30 * 60 * 1000, Math.max(3 * 60 * 1000, mb * 12 * 1000));
}

/** Logs serverResponse and setup hints when Firebase returns storage/unknown. */
function logStorageFailure(error: unknown): void {
  if (!(error instanceof FirebaseError) || !error.code.startsWith('storage/')) {
    return;
  }
  const serverResponse =
    'serverResponse' in error &&
    typeof (error as { serverResponse?: unknown }).serverResponse === 'string'
      ? (error as { serverResponse: string }).serverResponse
      : null;
  if (error.code === 'storage/unknown') {
    console.error(
      '[Firebase Storage] storage/unknown — set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET to the exact default bucket from Firebase Console → Storage (often project-id.firebasestorage.app for new projects). Ensure you are signed in; barcodes use path barcodes/. Disable extensions blocking firebasestorage.googleapis.com.',
      serverResponse ? `Server response: ${serverResponse}` : '(no server response body)',
    );
  }
}

// Upload progress callback type
export type UploadProgressCallback = (progress: number) => void;

/**
 * Upload a file to Firebase Storage
 * @param file - File to upload
 * @param path - Storage path (e.g., 'images/inventory/item123.jpg')
 * @param onProgress - Optional callback for upload progress (0-100)
 * @returns Promise with download URL
 */
/** Resumable uploads are more reliable for multi‑MB files; simple uploadBytes can appear to hang. */
const RESUMABLE_THRESHOLD_BYTES = 2 * 1024 * 1024;

async function runUploadWithStorage(
  st: FirebaseStorage,
  file: File,
  path: string,
  onProgress?: UploadProgressCallback
): Promise<string> {
  const storageRef = ref(st, path);
  const useResumable = file.size >= RESUMABLE_THRESHOLD_BYTES || onProgress != null;

  if (!useResumable) {
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  }

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot: UploadTaskSnapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress?.(progress);
      },
      (error) => {
        logStorageFailure(error);
        reject(error);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}

export async function uploadFile(
  file: File,
  path: string,
  onProgress?: UploadProgressCallback
): Promise<string> {
  await ensureAuthReadyForStorage();

  const fallbacks = alternateStoragesForUploadRetry();
  const candidates: FirebaseStorage[] = sessionStorageInstance
    ? [sessionStorageInstance, storage, ...fallbacks]
    : [storage, ...fallbacks];
  const storages = [...new Set(candidates)];
  let lastError: unknown;

  for (let i = 0; i < storages.length; i++) {
    try {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, 400));
      }
      const timeoutMs = uploadTimeoutMsForFile(file);
      const url = await withTimeout(
        runUploadWithStorage(storages[i], file, path, onProgress),
        timeoutMs,
        `Upload timed out after ${Math.round(timeoutMs / 60000)} min (${file.name}). Check your network, VPN, or ad blockers blocking firebasestorage.googleapis.com. Confirm NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET matches your project bucket.`
      );
      sessionStorageInstance = storages[i];
      return url;
    } catch (error) {
      lastError = error;
      const canRetryUnknown =
        error instanceof FirebaseError &&
        error.code === 'storage/unknown' &&
        i < storages.length - 1;
      if (canRetryUnknown) {
        continue;
      }
      logStorageFailure(error);
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  logStorageFailure(lastError);
  console.error('Error uploading file:', lastError);
  throw lastError;
}

/**
 * Upload multiple files to Firebase Storage
 * @param files - Array of files to upload
 * @param basePath - Base storage path (e.g., 'images/inventory/')
 * @param onProgress - Optional callback for overall upload progress
 * @returns Promise with array of download URLs
 */
export async function uploadMultipleFiles(
  files: File[],
  basePath: string,
  onProgress?: UploadProgressCallback
): Promise<string[]> {
  try {
    const totalFiles = files.length;
    let uploadedFiles = 0;
    const downloadURLs: string[] = [];
    
    for (const file of files) {
      // Generate unique filename with timestamp
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${basePath}${timestamp}_${sanitizedName}`;
      
      // Upload with progress tracking
      const url = await uploadFile(file, filePath, (progress) => {
        // Calculate overall progress across all files
        if (onProgress) {
          const overallProgress = ((uploadedFiles / totalFiles) * 100) + (progress / totalFiles);
          onProgress(overallProgress);
        }
      });
      
      downloadURLs.push(url);
      uploadedFiles++;
      
      // Call overall progress at completion
      if (onProgress) {
        onProgress((uploadedFiles / totalFiles) * 100);
      }
    }
    
    return downloadURLs;
  } catch (error) {
    logStorageFailure(error);
    console.error('Error uploading multiple files:', error);
    throw error;
  }
}

/**
 * Upload an image file (with validation)
 * @param file - Image file
 * @param path - Storage path
 * @param onProgress - Optional progress callback
 * @returns Promise with download URL
 */
export async function uploadImage(
  file: File,
  path: string,
  onProgress?: UploadProgressCallback
): Promise<string> {
  // Validate it's an image
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image');
  }
  
  // Validate file size (max 5MB)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error('Image must be less than 5MB');
  }
  
  return uploadFile(file, path, onProgress);
}

/**
 * CMS images under `images/cms/` — Storage rules allow up to 50MB on that path; inventory uses {@link uploadImage} (5MB).
 */
export async function uploadCmsImage(
  file: File,
  path: string,
  onProgress?: UploadProgressCallback
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image');
  }
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error('Image must be less than 50MB for CMS');
  }
  return uploadFile(file, path, onProgress);
}

/**
 * Upload multiple images
 * @param files - Array of image files
 * @param basePath - Base storage path
 * @param onProgress - Optional progress callback
 * @returns Promise with array of download URLs
 */
export async function uploadMultipleImages(
  files: File[],
  basePath: string,
  onProgress?: UploadProgressCallback
): Promise<string[]> {
  // Filter and validate images
  const imageFiles = files.filter(file => file.type.startsWith('image/'));
  
  if (imageFiles.length === 0) {
    throw new Error('No valid image files provided');
  }
  
  // Validate file sizes
  const maxSize = 5 * 1024 * 1024;
  for (const file of imageFiles) {
    if (file.size > maxSize) {
      throw new Error(`Image ${file.name} must be less than 5MB`);
    }
  }
  
  return uploadMultipleFiles(imageFiles, basePath, onProgress);
}

/**
 * Upload a video file
 * @param file - Video file
 * @param path - Storage path
 * @param onProgress - Optional progress callback
 * @returns Promise with download URL
 */
export async function uploadVideo(
  file: File,
  path: string,
  onProgress?: UploadProgressCallback
): Promise<string> {
  // Validate it's a video
  if (!file.type.startsWith('video/')) {
    throw new Error('File must be a video');
  }
  
  // Validate file size (max 100MB for videos)
  const maxSize = 100 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error('Video must be less than 100MB');
  }
  
  return uploadFile(file, path, onProgress);
}

/**
 * Delete a file from Firebase Storage
 * @param path - Storage path
 */
export async function deleteFile(path: string): Promise<void> {
  await ensureAuthReadyForStorage();
  const st = sessionStorageInstance ?? storage;
  try {
    const storageRef = ref(st, path);
    await deleteObject(storageRef);
  } catch (error) {
    logStorageFailure(error);
    console.error('Error deleting file:', error);
    throw error;
  }
}

/**
 * Delete multiple files from Firebase Storage
 * @param paths - Array of storage paths
 */
export async function deleteMultipleFiles(paths: string[]): Promise<void> {
  try {
    await Promise.all(paths.map(path => deleteFile(path)));
  } catch (error) {
    console.error('Error deleting files:', error);
    throw error;
  }
}

/**
 * Extract the storage path from a Firebase Storage URL
 * @param url - Firebase Storage URL
 * @returns Storage path or null if invalid
 */
export function extractStoragePath(url: string): string | null {
  try {
    // Firebase Storage URLs have multiple formats:
    // Format 1: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media&token=...
    // Format 2: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media
    // Format 3: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}
    
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // Extract path from /o/{path} pattern
    const match = pathname.match(/\/o\/(.+)$/);
    if (match) {
      const encodedPath = match[1];
      // Decode the path (handles %2F, %20, etc.)
      const decodedPath = decodeURIComponent(encodedPath);
      return decodedPath;
    }
    
    // Fallback: try to match with query params
    const altMatch = url.match(/\/o\/(.+?)(?:\?|$)/);
    if (altMatch) {
      return decodeURIComponent(altMatch[1]);
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting storage path from URL:', url, error);
    return null;
  }
}

/**
 * Check if a URL is a Firebase Storage URL
 */
export function isFirebaseStorageURL(url: string): boolean {
  return url.includes('firebasestorage.googleapis.com');
}

