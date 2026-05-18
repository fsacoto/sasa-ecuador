/** Parse manual sale price input (USD); empty/invalid → undefined. */
export function parseSalePriceInput(raw: string): number | undefined {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return undefined;
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100) / 100;
}

export function normalizeSalePrice(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100) / 100;
}

/** Table/detail: show em dash when unset. */
export function formatSalePriceDisplay(price: number | undefined): string {
  if (price == null || !Number.isFinite(price)) return '—';
  return `$${price.toFixed(2)}`;
}

/** Catalog PDF: always includes $ prefix when set. */
export function formatCatalogSalePrice(price: number | undefined): string {
  if (price == null || !Number.isFinite(price)) return '—';
  return `$${price.toFixed(2)}`;
}

export function itemHasSalePrice(item: { salePrice?: number }): boolean {
  return normalizeSalePrice(item.salePrice) !== undefined;
}
