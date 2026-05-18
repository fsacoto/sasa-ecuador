// Convert images to JPEG data URLs for @react-pdf/renderer (jpg/png only; WebP/SVG need rasterizing).

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

/** Rasteriza cualquier imagen cargable en el navegador a JPEG (react-pdf solo acepta jpg/png en base64). */
export async function rasterizeDataUrlToJpeg(base64Data: string, quality = 0.92): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const w = Math.min(Math.max(img.naturalWidth || img.width || 1, 1), 1600);
      const h = Math.min(Math.max(img.naturalHeight || img.height || 1, 1), 1600);
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
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for rasterize'));
    img.src = base64Data;
  });
}

/** Carga un Blob vía object URL (sin CORS en canvas) y devuelve JPEG para el PDF. */
async function rasterizeBlobToJpeg(blob: Blob): Promise<string | null> {
  if (!blob.size) return null;
  const objectUrl = URL.createObjectURL(blob);
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        const w = Math.min(Math.max(img.naturalWidth || img.width || 1, 1), 1600);
        const h = Math.min(Math.max(img.naturalHeight || img.height || 1, 1), 1600);
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
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('Failed to decode image blob'));
      img.src = objectUrl;
    });
    return dataUrl;
  } catch (error) {
    console.warn('rasterizeBlobToJpeg failed:', error);
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function fetchImageBlobDirect(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

async function fetchImageBlobViaProxy(url: string): Promise<Blob | null> {
  if (typeof window === 'undefined') return null;
  const origin = window.location.origin;

  try {
    const postRes = await fetch(`${origin}/api/download-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      cache: 'no-store',
    });
    if (postRes.ok) {
      const blob = await postRes.blob();
      if (blob.size > 0) return blob;
    }
  } catch {
    /* try GET fallback */
  }

  try {
    const getRes = await fetch(
      `${origin}/api/download-image?url=${encodeURIComponent(url)}`,
      { method: 'GET', cache: 'no-store' }
    );
    if (!getRes.ok) return null;
    const blob = await getRes.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

async function remoteUrlToJpegDataUrl(url: string): Promise<string | null> {
  let blob = await fetchImageBlobDirect(url);
  if (!blob) {
    blob = await fetchImageBlobViaProxy(url);
  }
  if (!blob) return null;
  return rasterizeBlobToJpeg(blob);
}

/** @deprecated Use rasterizeDataUrlToJpeg */
export async function convertWebPToJPEG(base64Data: string): Promise<string> {
  return rasterizeDataUrlToJpeg(base64Data, 0.9);
}

async function dataUrlForPdfRaster(base64String: string, sourceHint: string, mimeHint?: string): Promise<string | null> {
  if (looksLikeSvg(sourceHint, mimeHint) || looksLikeSvg(base64String, mimeHint)) {
    try {
      const png = await convertSvgDataUrlToPng(base64String);
      return rasterizeDataUrlToJpeg(png);
    } catch (error) {
      console.warn('Failed to convert SVG to PNG for PDF:', error);
      return null;
    }
  }

  const lower = `${sourceHint} ${base64String}`.toLowerCase();
  const isJpeg =
    mimeHint === 'image/jpeg' ||
    lower.includes('image/jpeg') ||
    base64String.startsWith('data:image/jpeg');

  if (isJpeg) {
    try {
      return await rasterizeDataUrlToJpeg(base64String);
    } catch (error) {
      console.warn('Failed to re-encode JPEG for PDF:', error);
      return base64String.startsWith('data:image/jpeg') ? base64String : null;
    }
  }

  try {
    return await rasterizeDataUrlToJpeg(base64String);
  } catch (error) {
    console.warn('Failed to rasterize image for PDF:', error);
    return null;
  }
}

export async function convertImageForPDF(imageUrl: string | undefined): Promise<string | null> {
  if (!imageUrl?.trim()) return null;

  const trimmed = imageUrl.trim();

  if (trimmed.startsWith('data:')) {
    return dataUrlForPdfRaster(trimmed, trimmed);
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const fromRemote = await remoteUrlToJpegDataUrl(trimmed);
    if (fromRemote) return fromRemote;
  }

  if (trimmed.startsWith('blob:')) {
    try {
      const res = await fetch(trimmed);
      const blob = await res.blob();
      return rasterizeBlobToJpeg(blob);
    } catch (error) {
      console.warn('Failed to convert blob: URL for PDF:', error);
      return null;
    }
  }

  console.warn('Unsupported image URL for PDF:', trimmed.slice(0, 80));
  return null;
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
