// SKU: [2 letters category][2 letters from line/material][supplier SKU, alphanumeric]
// Supplier SKU is the distinct key; collisions get -2, -3, …

export function sanitizeSupplierSkuPart(supplierSKU: string): string {
  const raw = (supplierSKU || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return raw.slice(0, 20);
}

/** 4-letter prefix: category (2) + line/material (2), same rules as legacy generator. */
export function buildSkuPrefix(category: string, line: string): string {
  const categoryCode = (category || 'XX')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .padEnd(2, 'X')
    .substring(0, 2);

  const lineWords = (line || 'XX XX')
    .replace(/[^a-zA-Z\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  let lineCode = 'XX';
  if (lineWords.length >= 2) {
    lineCode = (lineWords[0].charAt(0) + lineWords[1].charAt(0)).toUpperCase();
  } else if (lineWords.length === 1) {
    lineCode = lineWords[0].substring(0, 2).toUpperCase().padEnd(2, 'X');
  }

  return `${categoryCode}${lineCode}`;
}

/** Full SKU body before uniqueness suffix (no random digits). */
export function buildSkuBase(category: string, line: string, supplierSKU: string): string {
  const prefix = buildSkuPrefix(category, line);
  const sup = sanitizeSupplierSkuPart(supplierSKU);
  const distinct = sup || 'NOSKU';
  return `${prefix}${distinct}`;
}

export function isSkuUnique(sku: string, existingSkus: string[]): boolean {
  return !existingSkus.includes(sku);
}

/**
 * Unique internal SKU from category, material (line), and supplier SKU.
 * If supplier SKU is empty, uses NOSKU as placeholder (still unique via -N suffix when needed).
 */
export function generateUniqueSKU(
  category: string,
  line: string,
  supplierSKU: string,
  existingSkus: string[],
  maxAttempts: number = 200
): string {
  const base = buildSkuBase(category, line, supplierSKU);
  if (isSkuUnique(base, existingSkus)) return base;
  let n = 2;
  while (n <= maxAttempts) {
    const candidate = `${base}-${n}`;
    if (isSkuUnique(candidate, existingSkus)) return candidate;
    n += 1;
  }
  return `${base}-${Date.now().toString(36).toUpperCase().slice(-8)}`;
}

/** @deprecated Use generateUniqueSKU with supplierSKU; kept for accidental imports. */
export function generateSKU(category: string, line: string, supplierSKU: string = ''): string {
  return buildSkuBase(category, line, supplierSKU);
}

export function formatSKU(sku: string): string {
  if (sku.length >= 4) {
    return `${sku.substring(0, 4)}-${sku.substring(4)}`;
  }
  return sku;
}

/** SKUs already used elsewhere (inventory + other POs), for collision checks. */
export function collectUsedSkus(
  inventory: { sku: string }[],
  purchaseOrders: { sku: string; id: string }[],
  options?: { ignorePurchaseOrderId?: string }
): string[] {
  const set = new Set<string>();
  for (const i of inventory) {
    if (i.sku) set.add(i.sku);
  }
  for (const o of purchaseOrders) {
    if (options?.ignorePurchaseOrderId && o.id === options.ignorePurchaseOrderId) continue;
    if (o.sku) set.add(o.sku);
  }
  return [...set];
}
