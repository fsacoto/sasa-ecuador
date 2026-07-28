import type { InventoryItem } from '../types';
import { convertImageForPDF } from './imageConverter';

export type PdfProductImagesBySku = Record<string, string>;

/**
 * Builds a SKU -> embedded PDF image map using the inventory main image.
 * Missing or invalid images are skipped so PDF generation can continue.
 */
export async function buildPdfProductImagesBySku(
  skus: string[],
  inventory: InventoryItem[]
): Promise<PdfProductImagesBySku> {
  const uniqueSkus = Array.from(new Set(skus.map((sku) => sku?.trim()).filter(Boolean)));
  const imagesBySku: PdfProductImagesBySku = {};

  await Promise.all(
    uniqueSkus.map(async (sku) => {
      const inventoryItem = inventory.find((item) => item.sku === sku);
      const sourceImage = inventoryItem?.images?.find((url) => url?.trim());
      if (!sourceImage) return;

      try {
        const pdfImage = await convertImageForPDF(sourceImage);
        if (pdfImage) {
          imagesBySku[sku] = pdfImage;
        }
      } catch (error) {
        console.warn(`Failed to prepare PDF image for SKU ${sku}:`, error);
      }
    })
  );

  return imagesBySku;
}
