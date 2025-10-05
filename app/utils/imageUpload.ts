// Image upload utilities for local storage
// Images stored as base64 data URLs (easy to move to Firebase later)

export function convertImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function handleMultipleImageUpload(files: FileList): Promise<string[]> {
  const imagePromises = Array.from(files).map(file => {
    // Only process image files
    if (!file.type.startsWith('image/')) {
      return null;
    }
    return convertImageToBase64(file);
  });

  const results = await Promise.all(imagePromises);
  return results.filter((img): img is string => img !== null);
}

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

export function getImageThumbnail(base64: string): string {
  // For now, just return the same image
  // In production, you'd generate thumbnails
  return base64;
}
