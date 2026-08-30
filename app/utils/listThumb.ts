/** Miniatura de lista: ~10% del lado largo (mín. 160px, máx. 480px). */

export const LIST_THUMB_SCALE = 0.1;
export const LIST_THUMB_MIN_PX = 160;
export const LIST_THUMB_MAX_PX = 480;
export const LIST_THUMB_QUALITY = 0.65;
const SKIP_RESIZE_BYTES = 80_000;

/** `images/…/SKU.jpg` → `images/…/SKU.thumb.jpg`. Null si no aplica. */
export function listThumbStoragePath(originalPath: string): string | null {
  const path = originalPath.trim();
  if (!path) return null;
  if (path.includes('.thumb.')) return null;
  if (path.startsWith('barcodes/')) return null;
  if (path.includes('/videos/')) return null;
  const slash = path.lastIndexOf('/');
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dir = slash >= 0 ? path.slice(0, slash + 1) : '';
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${dir}${stem}.thumb.jpg`;
}

export function listThumbPixelSize(srcW: number, srcH: number): { w: number; h: number } {
  const longest = Math.max(srcW, srcH, 1);
  const target = Math.min(
    LIST_THUMB_MAX_PX,
    Math.max(LIST_THUMB_MIN_PX, Math.round(longest * LIST_THUMB_SCALE))
  );
  const scale = Math.min(1, target / longest);
  return {
    w: Math.max(1, Math.round(srcW * scale)),
    h: Math.max(1, Math.round(srcH * scale)),
  };
}

export async function rasterizeBlobToListThumb(blob: Blob): Promise<Blob> {
  if (blob.size <= SKIP_RESIZE_BYTES) return blob;
  const type = (blob.type || '').toLowerCase();
  if (type.includes('svg')) return blob;

  try {
    const bitmap = await createImageBitmap(blob);
    try {
      const srcW = bitmap.width || 1;
      const srcH = bitmap.height || 1;
      const { w, h } = listThumbPixelSize(srcW, srcH);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return blob;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      const jpeg = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', LIST_THUMB_QUALITY);
      });
      return jpeg && jpeg.size > 0 ? jpeg : blob;
    } finally {
      bitmap.close();
    }
  } catch {
    return blob;
  }
}

export async function fileToListThumbFile(file: File): Promise<File> {
  const thumb = await rasterizeBlobToListThumb(file);
  return new File([thumb], 'thumb.jpg', { type: 'image/jpeg' });
}
