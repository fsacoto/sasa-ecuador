// Convert WebP base64 images to JPEG for PDF compatibility
// @react-pdf/renderer has limited WebP support, so we convert to JPEG

export async function convertWebPToJPEG(base64Data: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Create an image element
    const img = new window.Image();
    
    img.onload = () => {
      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw image on canvas
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0);
      
      // Convert to JPEG base64
      try {
        const jpegBase64 = canvas.toDataURL('image/jpeg', 0.9);
        resolve(jpegBase64);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    // Set image source
    img.src = base64Data;
  });
}

export async function convertImageForPDF(base64Data: string | undefined): Promise<string | null> {
  if (!base64Data) return null;
  
  // If it's WebP, convert to JPEG
  if (base64Data.includes('image/webp')) {
    try {
      return await convertWebPToJPEG(base64Data);
    } catch (error) {
      console.error('Failed to convert WebP to JPEG:', error);
      return null;
    }
  }
  
  // If it's already JPEG or PNG, return as is
  return base64Data;
}

export async function convertProductImages(images: string[]): Promise<string[]> {
  const convertedImages: string[] = [];
  
  for (const image of images) {
    const converted = await convertImageForPDF(image);
    if (converted) {
      convertedImages.push(converted);
    }
  }
  
  return convertedImages;
}
