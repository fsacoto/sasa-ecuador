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

  // Prefer a fresh bars-only PNG so labels never include under-barcode SKU text.
  if (skuOk) {
    try {
      const png = generateBarcodeFromSKU(sku!);
      cache.set(key, png);
      return png;
    } catch (e) {
      console.warn('Barcode SKU regenerate failed:', sku, e);
    }
  }

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

function sanitizeDocNamePart(raw: string, max = 48): string {
  return raw
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .slice(0, max)
    .trim();
}

/**
 * Título / nombre de archivo según el contenido:
 * - 1 etiqueta → ítem (SKU o descripción)
 * - 1 factura → nombre de factura
 * - varias facturas → facturas resumidas
 */
export function buildBarcodeLabelsDocName(
  items: Array<{
    order: PurchaseOrder | null;
    inventoryItem: InventoryItem;
    quantity: number;
  }>
): { title: string; fileBase: string } {
  const expandedCount = items.reduce((n, it) => n + Math.max(1, it.quantity || 1), 0);
  const invoices = [
    ...new Set(
      items
        .map((it) => (it.order?.invoice || '').trim())
        .filter(Boolean)
    ),
  ];
  const first = items[0];
  const sku = (first?.order?.sku || first?.inventoryItem?.sku || '').trim();
  const name = (
    first?.order?.description ||
    first?.inventoryItem?.name ||
    first?.inventoryItem?.description ||
    ''
  ).trim();

  let title: string;
  if (items.length === 1 && expandedCount === 1) {
    const itemLabel = sanitizeDocNamePart(sku || name || 'etiqueta', 40);
    title = `Etiqueta ${itemLabel}`;
  } else if (invoices.length === 1) {
    title = `Etiquetas ${sanitizeDocNamePart(invoices[0], 40)}`;
  } else if (invoices.length > 1) {
    const head = sanitizeDocNamePart(invoices.slice(0, 2).join('_'), 36);
    title =
      invoices.length > 2
        ? `Etiquetas ${head}+${invoices.length - 2}`
        : `Etiquetas ${head}`;
  } else if (sku || name) {
    title = `Etiquetas ${sanitizeDocNamePart(sku || name, 40)}`;
  } else {
    title = 'Etiquetas';
  }

  const fileBase = sanitizeDocNamePart(title, 80).replace(/\s+/g, '-');
  return { title, fileBase: fileBase || 'Etiquetas' };
}

export function downloadBarcodePdfBlob(blob: Blob, fileBase?: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const base = sanitizeDocNamePart(fileBase || 'Etiquetas', 80).replace(/\s+/g, '-') || 'Etiquetas';
  link.download = `${base}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
