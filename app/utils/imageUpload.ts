// Image upload utilities for Firebase Storage

import { uploadMultipleImages } from '../services/storageService';

export function convertImageToBase64(file: File): Promise<string> {
  // Legacy function for backward compatibility with components that still use base64
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Upload multiple images to Firebase Storage
 * @param files - FileList or File[] to upload
 * @param pathPrefix - Path prefix in storage (e.g., 'inventory/', 'cms/')
 * @param onProgress - Optional progress callback
 * @returns Array of Firebase Storage download URLs
 */
export async function handleMultipleImageUpload(
  files: FileList | File[],
  pathPrefix: string = 'images/',
  onProgress?: (progress: number) => void
): Promise<string[]> {
  try {
    const fileArray = files instanceof FileList ? Array.from(files) : files;
    
    // Use Firebase Storage
    return await uploadMultipleImages(fileArray, pathPrefix, onProgress);
  } catch (error) {
    console.error('Error uploading images to Firebase Storage:', error);
    throw error;
  }
}

/**
 * Validate an image file
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  // Check if it's an image
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: 'File must be an image' };
  }

  // Check file size (max 5MB)
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    return { valid: false, error: 'Image must be less than 5MB' };
  }

  return { valid: true };
}

/**
 * Get image thumbnail (placeholder for future implementation)
 */
export function getImageThumbnail(url: string): string {
  // For Firebase Storage URLs, you could generate thumbnails
  // For now, just return the same URL
  return url;
}
