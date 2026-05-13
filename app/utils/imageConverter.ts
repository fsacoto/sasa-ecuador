// Convert WebP base64 images to JPEG for PDF compatibility
// @react-pdf/renderer has limited WebP support, so we convert to JPEG
// SVG barcodes (Storage / data URLs) must be rasterized: react-pdf Image does not render SVG reliably.

export async function convertSvgDataUrlToPng(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (!w || !h) {
        w = 400;
        h = 120;
      }
      w = Math.min(Math.max(w, 1), 1200);
      h = Math.min(Math.max(h, 1), 600);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
      try {
        resolve(canvas.toDataURL('image/png', 1));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    img.onerror = () => reject(new Error('Failed to load SVG for PDF'));
    img.src = dataUrl;
  });
}

function looksLikeSvg(url: string, mimeHint?: string): boolean {
  const u = url.toLowerCase();
  const m = (mimeHint || '').toLowerCase();
  return (
    m === 'image/svg+xml' ||
    u.includes('image/svg+xml') ||
    u.includes('data:image/svg') ||
    (u.startsWith('http') && u.includes('.svg'))
  );
}

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

export async function convertImageForPDF(imageUrl: string | undefined): Promise<string | null> {
  if (!imageUrl) return null;
  
  // If it's already a base64 data URL, handle it
  if (imageUrl.startsWith('data:')) {
    if (looksLikeSvg(imageUrl)) {
      try {
        return await convertSvgDataUrlToPng(imageUrl);
      } catch (error) {
        console.error('Failed to convert SVG to PNG for PDF:', error);
        return null;
      }
    }
    // If it's WebP, convert to JPEG
    if (imageUrl.includes('image/webp')) {
      try {
        return await convertWebPToJPEG(imageUrl);
      } catch (error) {
        console.error('Failed to convert WebP to JPEG:', error);
        return null;
      }
    }
    // If it's already JPEG or PNG, return as is
    return imageUrl;
  }
  
  // If it's a URL (Firebase Storage, HTTP, etc.), use API route to bypass CORS
  try {
    // Use the API route to fetch images server-side (bypasses CORS)
    const apiUrl = `/api/download-image?url=${encodeURIComponent(imageUrl)}`;
    const response = await fetch(apiUrl, {
      method: 'GET',
      cache: 'no-cache',
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch image via API (${response.status}):`, imageUrl);
      return null;
    }
    
    const blob = await response.blob();
    
    // Convert blob to base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        if (looksLikeSvg(imageUrl, blob.type) || looksLikeSvg(base64String, blob.type)) {
          convertSvgDataUrlToPng(base64String)
            .then(resolve)
            .catch((err) => {
              console.warn('Failed to convert fetched SVG to PNG for PDF:', err);
              reject(err instanceof Error ? err : new Error(String(err)));
            });
          return;
        }
        // If it's WebP, convert to JPEG
        if (blob.type === 'image/webp' || base64String.includes('image/webp')) {
          convertWebPToJPEG(base64String)
            .then(resolve)
            .catch((err) => {
              console.warn('Failed to convert WebP, using original:', err);
              resolve(base64String); // Fallback to original if conversion fails
            });
        } else {
          resolve(base64String);
        }
      };
      reader.onerror = () => {
        console.warn('FileReader error for image:', imageUrl);
        reject(new Error('Failed to read image blob'));
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Error converting image URL to base64:', imageUrl, error);
    return null;
  }
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
