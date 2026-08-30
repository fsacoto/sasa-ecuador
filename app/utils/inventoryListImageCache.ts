/**
 * Miniaturas de lista: mostrar lo antes posible.
 * 1) caché local  2) URL del .thumb.jpg  3) original (el navegador lo pinta al vuelo)
 * La miniatura en Storage se genera en segundo plano, sin bloquear la pantalla.
 */

import {
  LIST_THUMB_QUALITY,
  listThumbPixelSize,
  listThumbStoragePath,
  rasterizeBlobToListThumb,
} from './listThumb';

const CACHE_NAME = 'sasa-inventory-list-thumbs-v3';
const MAX_CACHED_THUMB_BYTES = 250_000;
const GENERATE_CONCURRENCY = 2;

const memory = new Map<string, Blob>();
const objectUrls = new Map<string, string>();
const inflightGenerate = new Set<string>();

let generateInFlight = 0;
const generateWaiters: Array<() => void> = [];

function eoLoFallbacks(url: string): string[] {
  const variants = new Set<string>([url]);
  const swap = (input: string, from: 'EO' | 'LO', to: 'EO' | 'LO') =>
    input.replace(
      new RegExp(`([A-Za-z]{2})${from}(\\d{4}(?:-\\d+)?)`, 'gi'),
      (_m, prefix: string, seq: string) => `${prefix.toUpperCase()}${to}${seq}`
    );
  for (const base of [...variants]) {
    const toLo = swap(base, 'EO', 'LO');
    const toEo = swap(base, 'LO', 'EO');
    if (toLo !== base) variants.add(toLo);
    if (toEo !== base) variants.add(toEo);
  }
  return [...variants];
}

export function inventoryListImageCandidates(urls: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const url = raw?.trim();
    if (!url) continue;
    for (const variant of eoLoFallbacks(url)) {
      if (seen.has(variant)) continue;
      seen.add(variant);
      out.push(variant);
    }
  }
  return out;
}

async function storageSdk() {
  const [{ ref, getDownloadURL }, { storage }] = await Promise.all([
    import('firebase/storage'),
    import('./firebase'),
  ]);
  return { ref, getDownloadURL, storage };
}

function objectUrlFor(url: string, blob: Blob): string {
  const existing = objectUrls.get(url);
  if (existing) return existing;
  const href = URL.createObjectURL(blob);
  objectUrls.set(url, href);
  return href;
}

async function withGenerateSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (generateInFlight >= GENERATE_CONCURRENCY) {
    await new Promise<void>((resolve) => generateWaiters.push(resolve));
  }
  generateInFlight += 1;
  try {
    return await fn();
  } finally {
    generateInFlight -= 1;
    generateWaiters.shift()?.();
  }
}

async function tryThumbDownloadUrl(originalUrl: string): Promise<string | null> {
  const { extractStoragePath, isFirebaseStorageURL } = await import('../services/storageService');
  if (!isFirebaseStorageURL(originalUrl)) return null;
  const path = extractStoragePath(originalUrl);
  if (!path) return null;
  const thumbPath = listThumbStoragePath(path);
  if (!thumbPath) return null;
  try {
    const { ref, getDownloadURL, storage } = await storageSdk();
    return await Promise.race([
      getDownloadURL(ref(storage, thumbPath)),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('thumb-url-timeout')), 2500)
      ),
    ]);
  } catch {
    return null;
  }
}

async function writePersistentCache(url: string, blob: Blob): Promise<void> {
  memory.set(url, blob);
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      url,
      new Response(blob, {
        headers: {
          'Content-Type': blob.type || 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000',
        },
      })
    );
  } catch {
    /* quota */
  }
}

async function readPersistentCache(url: string): Promise<Blob | null> {
  const mem = memory.get(url);
  if (mem) return mem;
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (!hit) return null;
    const blob = await hit.blob();
    if (!blob.size || blob.size > MAX_CACHED_THUMB_BYTES) return null;
    memory.set(url, blob);
    return blob;
  } catch {
    return null;
  }
}

async function uploadGeneratedThumb(originalUrl: string, thumb: Blob): Promise<void> {
  try {
    const { extractStoragePath, isFirebaseStorageURL, uploadFile } = await import(
      '../services/storageService'
    );
    if (!isFirebaseStorageURL(originalUrl)) return;
    const path = extractStoragePath(originalUrl);
    if (!path) return;
    const thumbPath = listThumbStoragePath(path);
    if (!thumbPath) return;
    const file = new File([thumb], 'thumb.jpg', { type: 'image/jpeg' });
    await uploadFile(file, thumbPath);
  } catch (error) {
    console.warn('Could not save list thumb to Storage:', error);
  }
}

function isSmallEnoughListThumb(thumb: Blob, originalSize?: number): boolean {
  if (thumb.size > MAX_CACHED_THUMB_BYTES) return false;
  if (originalSize != null && originalSize > 0 && thumb.size >= originalSize * 0.6) return false;
  return true;
}

async function persistThumb(originalUrl: string, thumb: Blob, originalSize?: number): Promise<void> {
  if (!isSmallEnoughListThumb(thumb, originalSize)) return;
  await writePersistentCache(originalUrl, thumb);
  void uploadGeneratedThumb(originalUrl, thumb);
}

function loadCorsImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('cors-image'));
    im.src = url;
  });
}

async function blobFromCorsImage(url: string): Promise<Blob | null> {
  try {
    const im = await loadCorsImage(url);
    return await blobFromImgScaled(im);
  } catch {
    return null;
  }
}

function blobFromImgScaled(img: HTMLImageElement): Promise<Blob | null> {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) return Promise.resolve(null);
  const { w, h } = listThumbPixelSize(srcW, srcH);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  try {
    ctx.drawImage(img, 0, 0, w, h);
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b && b.size > 0 ? b : null), 'image/jpeg', LIST_THUMB_QUALITY);
    } catch {
      resolve(null);
    }
  });
}

async function blobFromStorage(originalUrl: string): Promise<Blob | null> {
  const { extractStoragePath, isFirebaseStorageURL, getStorageFileBlob } = await import(
    '../services/storageService'
  );
  if (!isFirebaseStorageURL(originalUrl)) return null;
  const path = extractStoragePath(originalUrl);
  if (!path || !listThumbStoragePath(path)) return null;
  try {
    return await getStorageFileBlob(path);
  } catch {
    return null;
  }
}

async function blobFromSameOriginProxy(originalUrl: string): Promise<Blob | null> {
  try {
    const res = await fetch('/api/download-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: originalUrl }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size || blob.size > 8 * 1024 * 1024) return null;
    return blob;
  } catch {
    return null;
  }
}

/** Pinta ya: caché → miniatura en Storage → original (sin esperar a recortar). */
export async function resolveInventoryListImageSrc(originalUrl: string): Promise<string> {
  const url = originalUrl.trim();
  if (!url) throw new Error('empty url');

  const cached = await readPersistentCache(url);
  if (cached) return objectUrlFor(url, cached);

  const thumbHref = await tryThumbDownloadUrl(url);
  if (thumbHref) return thumbHref;

  return url;
}

/** Tras pintar el original, crea el .thumb.jpg sin bloquear ni volver a pintar. */
export async function captureListThumbFromImg(
  originalUrl: string,
  img: HTMLImageElement
): Promise<void> {
  const url = originalUrl.trim();
  if (!url || url.startsWith('blob:') || url.includes('.thumb.jpg')) return;
  if (memory.has(url) || inflightGenerate.has(url)) return;

  inflightGenerate.add(url);
  try {
    await withGenerateSlot(async () => {
      if (memory.has(url)) return;

      const fromCanvas =
        (await blobFromImgScaled(img)) || (await blobFromCorsImage(url));
      if (fromCanvas && isSmallEnoughListThumb(fromCanvas)) {
        await persistThumb(url, fromCanvas);
        return;
      }

      const original =
        (await blobFromStorage(url)) || (await blobFromSameOriginProxy(url));
      if (!original?.size) return;
      const thumb = await rasterizeBlobToListThumb(original);
      await persistThumb(url, thumb, original.size);
    });
  } catch {
    /* next visit still shows original until a thumb exists */
  } finally {
    inflightGenerate.delete(url);
  }
}

export function isLikelyListThumbSrc(src: string): boolean {
  return src.includes('.thumb.jpg') || src.startsWith('blob:');
}
