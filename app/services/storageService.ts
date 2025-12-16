import { 
  ref, 
  uploadBytes, 
  uploadBytesResumable, 
  getDownloadURL, 
  deleteObject,
  UploadTaskSnapshot 
} from 'firebase/storage';
import { storage } from '../utils/firebase';

// Upload progress callback type
export type UploadProgressCallback = (progress: number) => void;

/**
 * Upload a file to Firebase Storage
 * @param file - File to upload
 * @param path - Storage path (e.g., 'images/inventory/item123.jpg')
 * @param onProgress - Optional callback for upload progress (0-100)
 * @returns Promise with download URL
 */
export async function uploadFile(
  file: File,
  path: string,
  onProgress?: UploadProgressCallback
): Promise<string> {
  try {
    const storageRef = ref(storage, path);
    
    // If no progress callback, use simple upload
    if (!onProgress) {
      await uploadBytes(storageRef, file);
      return await getDownloadURL(storageRef);
    }
    
    // Otherwise, use resumable upload for progress tracking
    return new Promise((resolve, reject) => {
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      uploadTask.on(
        'state_changed',
        (snapshot: UploadTaskSnapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress(progress);
        },
        (error) => reject(error),
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
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
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
  try {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (error) {
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

