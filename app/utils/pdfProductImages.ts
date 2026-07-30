import type { InventoryItem } from '../types';
import { convertImageForPDF } from './imageConverter';

export type PdfProductImagesBySku = Record<string, string>;

/** PDF table photos are ~52pt — keep embeds tiny for faster generation. */
const PDF_THUMB_MAX_DIMENSION = 160;
const PDF_THUMB_QUALITY = 0.72;
const PDF_IMAGE_CONCURRENCY = 6;

/** Session cache so re-downloading the same consignment PDF skips re-rasterizing. */
const pdfThumbCache = new Map<string, string>();

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

/**
 * Builds a SKU -> embedded PDF image map using the inventory main image.
 * Missing or invalid images are skipped so PDF generation can continue.
 * Images are downscaled to small JPEG thumbnails for speed.
 */
export async function buildPdfProductImagesBySku(
  skus: string[],
  inventory: InventoryItem[]
): Promise<PdfProductImagesBySku> {
  const uniqueSkus = Array.from(new Set(skus.map((sku) => sku?.trim()).filter(Boolean)));
  const imagesBySku: PdfProductImagesBySku = {};
  const inventoryBySku = new Map(inventory.map((item) => [item.sku, item]));

  await mapWithConcurrency(uniqueSkus, PDF_IMAGE_CONCURRENCY, async (sku) => {
    const inventoryItem = inventoryBySku.get(sku);
    const sourceImage = inventoryItem?.images?.find((url) => url?.trim());
    if (!sourceImage) return;

    const cacheKey = `${sourceImage}::${PDF_THUMB_MAX_DIMENSION}::${PDF_THUMB_QUALITY}::sq`;
    const cached = pdfThumbCache.get(cacheKey);
    if (cached) {
      imagesBySku[sku] = cached;
      return;
    }

    try {
      const pdfImage = await convertImageForPDF(sourceImage, {
        maxDimension: PDF_THUMB_MAX_DIMENSION,
        quality: PDF_THUMB_QUALITY,
        cache: 'force-cache',
        squarePad: true,
      });
      if (pdfImage) {
        pdfThumbCache.set(cacheKey, pdfImage);
        imagesBySku[sku] = pdfImage;
      }
    } catch (error) {
      console.warn(`Failed to prepare PDF image for SKU ${sku}:`, error);
    }
  });

  return imagesBySku;
}
