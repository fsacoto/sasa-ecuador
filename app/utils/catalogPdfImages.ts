/**
 * Imagen principal del inventario (images[0]) → data URL JPEG para react-pdf.
 */

import type { InventoryItem } from '../types';

const MAX_PDF_IMAGE_PX = 520;
const IMAGE_FETCH_MS = 12_000;

function isFirebaseStorageURL(url: string): boolean {
  return url.includes('firebasestorage.googleapis.com');
}

function extractStoragePath(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\/o\/(.+)$/);
    if (match) return decodeURIComponent(match[1]);
    const alt = url.match(/\/o\/(.+?)(?:\?|$)/);
    if (alt) return decodeURIComponent(alt[1]);
    return null;
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

function isPdfEmbedDataUrl(src: string): boolean {
  const s = src.trim();
  return (
    s.startsWith('data:image/jpeg;base64,') ||
    s.startsWith('data:image/jpg;base64,') ||
    s.startsWith('data:image/png;base64,')
  );
}

async function rasterizeBlobToJpegDataUrl(blob: Blob): Promise<string | null> {
  if (!blob.size) return null;
  const objectUrl = URL.createObjectURL(blob);
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        try {
          let w = img.naturalWidth || img.width || 1;
          let h = img.naturalHeight || img.height || 1;
          const scale = Math.min(1, MAX_PDF_IMAGE_PX / Math.max(w, h));
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('No canvas context'));
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('Image decode failed'));
      img.src = objectUrl;
    });
    return isPdfEmbedDataUrl(dataUrl) ? dataUrl : null;
  } catch (error) {
    console.warn('[catalog PDF] rasterize failed:', error);
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function fetchBlobViaProxy(downloadUrl: string): Promise<Blob | null> {
  if (typeof window === 'undefined') return null;
  const origin = window.location.origin;

  const load = async (url: string, init?: RequestInit) => {
    const res = await fetch(url, { cache: 'no-store', ...init });
    if (!res.ok) return null;
    const ct = res.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) return null;
    const blob = await res.blob();
    return blob.size > 0 ? blob : null;
  };

  try {
    const blob = await load(`${origin}/api/download-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: downloadUrl }),
    });
    if (blob) return blob;
  } catch {
    /* GET fallback */
  }

  try {
    return await load(
      `${origin}/api/download-image?url=${encodeURIComponent(downloadUrl)}`,
      { method: 'GET' }
    );
  } catch {
    return null;
  }
}

async function fetchBlobDirect(downloadUrl: string): Promise<Blob | null> {
  try {
    const res = await fetch(downloadUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

async function fetchBlobFromFirebaseSdk(downloadUrl: string): Promise<Blob | null> {
  if (!isFirebaseStorageURL(downloadUrl)) return null;
  const path = extractStoragePath(downloadUrl);
  if (!path) return null;

  try {
    const [{ ref, getBlob }, { storage }] = await Promise.all([
      import('firebase/storage'),
      import('./firebase'),
    ]);
    const blob = await getBlob(ref(storage, path));
    return blob.size > 0 ? blob : null;
  } catch (error) {
    console.warn('[catalog PDF] Firebase getBlob failed:', path, error);
    return null;
  }
}

async function downloadImageBlob(downloadUrl: string): Promise<Blob | null> {
  const tasks = [
    () => fetchBlobViaProxy(downloadUrl),
    () => fetchBlobDirect(downloadUrl),
    () => fetchBlobFromFirebaseSdk(downloadUrl),
  ];

  for (const task of tasks) {
    try {
      const blob = await withTimeout(task(), IMAGE_FETCH_MS, 'image fetch');
      if (blob) return blob;
    } catch (error) {
      console.warn('[catalog PDF] fetch attempt failed:', error);
    }
  }
  return null;
}

/** Convierte images[0] del inventario a JPEG embebido para react-pdf. */
export async function convertInventoryMainImageForPdf(
  imageUrl: string | undefined
): Promise<string | null> {
  const trimmed = imageUrl?.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:image/')) {
    if (isPdfEmbedDataUrl(trimmed)) return trimmed;
    try {
      const res = await fetch(trimmed);
      const blob = await res.blob();
      return rasterizeBlobToJpegDataUrl(blob);
    } catch {
      return null;
    }
  }

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return null;
  }

  const blob = await downloadImageBlob(trimmed);
  if (!blob) {
    console.warn('[catalog PDF] could not load image:', trimmed.slice(0, 100));
    return null;
  }

  return rasterizeBlobToJpegDataUrl(blob);
}

/** Prepara productos para el PDF; nunca lanza (el PDF debe generarse aunque fallen fotos). */
export async function prepareInventoryItemsForCatalogPdf(
  products: InventoryItem[]
): Promise<InventoryItem[]> {
  const prepared = await Promise.all(
    products.map(async (product) => {
      try {
        const mainUrl = product.images?.[0];
        if (!mainUrl?.trim()) {
          return { ...product, images: [] as string[] };
        }

        const pdfImage = await convertInventoryMainImageForPdf(mainUrl);
        return {
          ...product,
          images: pdfImage ? [pdfImage] : [],
        };
      } catch (error) {
        console.warn('[catalog PDF] skip image for', product.sku || product.id, error);
        return { ...product, images: [] as string[] };
      }
    })
  );

  return prepared;
}
