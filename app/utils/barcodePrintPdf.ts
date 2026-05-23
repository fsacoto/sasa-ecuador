import type { PurchaseOrder, InventoryItem } from '../types';
import { convertImageForPDF } from './imageConverter';
import { generateBarcodeFromSKU, isValidBarcodeInput } from './barcodeGenerator';

export type BarcodePrintPdfItem = {
  order: PurchaseOrder | null;
  inventoryItem: InventoryItem;
  quantity: number;
};

export type BarcodePrintProgressPhase = 'images' | 'pdf';

function looksLikeSvg(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes('image/svg+xml') ||
    u.includes('data:image/svg') ||
    (u.startsWith('http') && u.includes('.svg'))
  );
}

function canUseDirectInPdf(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.startsWith('data:image/png') || u.startsWith('data:image/jpeg');
}

function cacheKeyFor(rawUrl: string, sku: string | undefined): string {
  return `${rawUrl.trim()}|${(sku ?? '').trim()}`;
}

async function resolveBarcodeForPdf(
  rawUrl: string,
  sku: string | undefined,
  cache: Map<string, string>
): Promise<string> {
  const key = cacheKeyFor(rawUrl, sku);
  if (cache.has(key)) {
    return cache.get(key)!;
  }

  const trimmed = rawUrl.trim();
  const skuOk = Boolean(sku && isValidBarcodeInput(sku));

  if (trimmed && canUseDirectInPdf(trimmed)) {
    cache.set(key, trimmed);
    return trimmed;
  }

  if (trimmed && !looksLikeSvg(trimmed)) {
    try {
      const converted = await convertImageForPDF(trimmed);
      if (converted) {
        cache.set(key, converted);
        return converted;
      }
    } catch (e) {
      console.warn('Barcode convert for PDF:', trimmed.slice(0, 80), e);
    }
  }

  if (skuOk) {
    try {
      const png = generateBarcodeFromSKU(sku!);
      cache.set(key, png);
      return png;
    } catch (e) {
      console.warn('Barcode SKU fallback failed:', sku, e);
    }
  }

  cache.set(key, '');
  return '';
}

/** Convierte cada código de barras único una sola vez (mucho más rápido en facturas grandes). */
export async function prepareBarcodePrintItemsForPdf(
  items: BarcodePrintPdfItem[],
  onProgress?: (phase: BarcodePrintProgressPhase, current: number, total: number) => void
): Promise<BarcodePrintPdfItem[]> {
  const cache = new Map<string, string>();
  const unique = new Map<string, { rawUrl: string; sku: string | undefined }>();

  for (const item of items) {
    const rawUrl =
      item.inventoryItem?.barcode?.trim() || item.order?.barcode?.trim() || '';
    const sku = item.order?.sku || item.inventoryItem?.sku;
    const key = cacheKeyFor(rawUrl, sku);
    if (!unique.has(key)) {
      unique.set(key, { rawUrl, sku });
    }
  }

  const entries = [...unique.values()];
  const total = Math.max(entries.length, 1);

  for (let i = 0; i < entries.length; i++) {
    const { rawUrl, sku } = entries[i];
    await resolveBarcodeForPdf(rawUrl, sku, cache);
    onProgress?.('images', i + 1, total);
  }

  return items.map((item) => {
    const rawUrl =
      item.inventoryItem?.barcode?.trim() || item.order?.barcode?.trim() || '';
    const sku = item.order?.sku || item.inventoryItem?.sku;
    const barcode = cache.get(cacheKeyFor(rawUrl, sku)) ?? '';
    return {
      ...item,
      inventoryItem: {
        ...item.inventoryItem,
        barcode,
      },
    };
  });
}

export function downloadBarcodePdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `barcodes-${new Date().toISOString().split('T')[0]}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
