// SKU interno: [2 letras categoría][2 letras línea/material][secuencia numérica 4 dígitos]
// Ej.: JOMA0001, JOMA0002.
// El SKU del proveedor identifica si es el mismo producto; nunca dos SKU internos distintos
// para el mismo SKU de proveedor (inventario u órdenes de compra).

const SEQ_DIGITS = 4;

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const LINE_STOPWORDS = new Set([
  'en',
  'de',
  'y',
  'el',
  'la',
  'los',
  'las',
  'del',
  'al',
  'a',
]);

function meaningfulLineWords(line: string): string[] {
  const tokens = stripDiacritics(line || '')
    .split(/\s+/)
    .map((t) => t.replace(/[^A-Za-z]/g, '').trim())
    .filter((t) => t.length >= 2)
    .filter((t) => !LINE_STOPWORDS.has(t.toLowerCase()));
  return tokens;
}

/** Clave normalizada para comparar SKU de proveedor. */
export function normalizeSupplierSkuKey(supplierSKU: string): string {
  return (supplierSKU || '').trim().toLowerCase();
}

/** @deprecated El SKU interno ya no incluye el código del proveedor. */
export function sanitizeSupplierSkuPart(supplierSKU: string): string {
  const raw = (supplierSKU || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return raw.slice(0, 20);
}

export function buildSkuPrefix(category: string, line: string): string {
  const categoryCode = stripDiacritics(category || 'XX')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .padEnd(2, 'X')
    .substring(0, 2);

  const lineWords = meaningfulLineWords(line || 'XX XX');

  let lineCode = 'XX';
  if (lineWords.length >= 2) {
    lineCode = (lineWords[0].charAt(0) + lineWords[1].charAt(0)).toUpperCase();
  } else if (lineWords.length === 1) {
    lineCode = lineWords[0].substring(0, 2).toUpperCase().padEnd(2, 'X');
  }

  return `${categoryCode}${lineCode}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maxSequenceForPrefix(prefix: string, existingSkus: string[]): number {
  let max = 0;
  const re = new RegExp(`^${escapeRegExp(prefix)}(\\d{${SEQ_DIGITS}})(?:-\\d+)?$`, 'i');
  for (const sku of existingSkus) {
    const m = sku.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

export function buildSkuBase(category: string, line: string, existingSkus: string[]): string {
  const prefix = buildSkuPrefix(category, line);
  const next = maxSequenceForPrefix(prefix, existingSkus) + 1;
  return `${prefix}${String(next).padStart(SEQ_DIGITS, '0')}`;
}

export function isSkuUnique(sku: string, existingSkus: string[]): boolean {
  return !existingSkus.includes(sku);
}

export function isSequentialInternalSku(sku: string): boolean {
  return /^[A-Z]{4}\d{4}(?:-\d+)?$/i.test((sku || '').trim());
}

export function generateUniqueSKU(
  category: string,
  line: string,
  existingSkus: string[],
  maxAttempts: number = 200
): string {
  const base = buildSkuBase(category, line, existingSkus);
  if (isSkuUnique(base, existingSkus)) return base;
  let n = 2;
  while (n <= maxAttempts) {
    const candidate = `${base}-${n}`;
    if (isSkuUnique(candidate, existingSkus)) return candidate;
    n += 1;
  }
  return `${base}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

type SkuRecord = {
  sku: string;
  supplierSKU?: string;
  id?: string;
  createdAt?: Date | string;
};

export type ResolveInternalSkuParams = {
  category: string;
  line: string;
  supplierSKU?: string;
  inventory: SkuRecord[];
  purchaseOrders: SkuRecord[];
  extraUsedSkus?: string[];
  ignorePurchaseOrderId?: string;
  ignoreInventoryId?: string;
  /** Mismo lote de importación: supplier key → SKU interno ya asignado */
  batchReservations?: Map<string, string>;
};

/**
 * SKU interno canónico para un SKU de proveedor (inventario primero, luego OC más reciente).
 */
export function findInternalSkuBySupplierSku(
  supplierSKU: string,
  inventory: SkuRecord[],
  purchaseOrders: SkuRecord[],
  options?: {
    ignorePurchaseOrderId?: string;
    ignoreInventoryId?: string;
  }
): string | undefined {
  const key = normalizeSupplierSkuKey(supplierSKU);
  if (!key) return undefined;

  for (const item of inventory) {
    if (options?.ignoreInventoryId && item.id === options.ignoreInventoryId) continue;
    if (normalizeSupplierSkuKey(item.supplierSKU || '') === key && item.sku?.trim()) {
      return item.sku.trim();
    }
  }

  const hits = purchaseOrders.filter(
    (o) =>
      normalizeSupplierSkuKey(o.supplierSKU || '') === key &&
      String(o.sku || '').trim() !== '' &&
      (!options?.ignorePurchaseOrderId || o.id !== options.ignorePurchaseOrderId)
  );
  if (hits.length === 0) return undefined;

  hits.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  return String(hits[0].sku).trim();
}

/** Otro SKU de proveedor ya usa este SKU interno. */
export function findConflictingSupplierSkuForInternal(
  internalSku: string,
  supplierSKU: string,
  inventory: SkuRecord[],
  purchaseOrders: SkuRecord[],
  options?: { ignorePurchaseOrderId?: string; ignoreInventoryId?: string }
): string | undefined {
  const target = (internalSku || '').trim();
  if (!target) return undefined;
  const wantKey = normalizeSupplierSkuKey(supplierSKU);
  if (!wantKey) return undefined;

  const check = (recordSupplier: string | undefined) => {
    const key = normalizeSupplierSkuKey(recordSupplier || '');
    return key && key !== wantKey;
  };

  for (const item of inventory) {
    if (options?.ignoreInventoryId && item.id === options.ignoreInventoryId) continue;
    if (item.sku?.trim() === target && check(item.supplierSKU)) {
      return (item.supplierSKU || '').trim();
    }
  }
  for (const o of purchaseOrders) {
    if (options?.ignorePurchaseOrderId && o.id === options.ignorePurchaseOrderId) continue;
    if (String(o.sku || '').trim() === target && check(o.supplierSKU)) {
      return (o.supplierSKU || '').trim();
    }
  }
  return undefined;
}

export type SkuAssignmentValidation =
  | { ok: true; sku: string }
  | { ok: false; sku: string; reason: 'supplier_mismatch' | 'internal_taken' };

/**
 * Garantiza coherencia SKU proveedor ↔ SKU interno antes de guardar.
 */
export function validateAndNormalizeInternalSku(
  internalSku: string,
  supplierSKU: string,
  inventory: SkuRecord[],
  purchaseOrders: SkuRecord[],
  options?: { ignorePurchaseOrderId?: string; ignoreInventoryId?: string }
): SkuAssignmentValidation {
  const trimmedInternal = (internalSku || '').trim();
  const trimmedSupplier = (supplierSKU || '').trim();

  if (!trimmedSupplier) {
    return trimmedInternal
      ? { ok: true, sku: trimmedInternal }
      : { ok: true, sku: '' };
  }

  const expectedBySupplier = findInternalSkuBySupplierSku(
    trimmedSupplier,
    inventory,
    purchaseOrders,
    options
  );

  if (expectedBySupplier) {
    if (trimmedInternal && trimmedInternal !== expectedBySupplier) {
      return { ok: false, sku: expectedBySupplier, reason: 'supplier_mismatch' };
    }
    return { ok: true, sku: expectedBySupplier };
  }

  if (!trimmedInternal) {
    return { ok: true, sku: '' };
  }

  const otherSupplier = findConflictingSupplierSkuForInternal(
    trimmedInternal,
    trimmedSupplier,
    inventory,
    purchaseOrders,
    options
  );
  if (otherSupplier) {
    return { ok: false, sku: trimmedInternal, reason: 'internal_taken' };
  }

  return { ok: true, sku: trimmedInternal };
}

/**
 * Resuelve SKU interno: enlaza por SKU de proveedor o genera secuencia nueva.
 */
export function resolveInternalSku(params: ResolveInternalSkuParams): string {
  const supKey = normalizeSupplierSkuKey(params.supplierSKU || '');

  if (supKey && params.batchReservations?.has(supKey)) {
    return params.batchReservations.get(supKey)!;
  }

  const linked = params.supplierSKU
    ? findInternalSkuBySupplierSku(params.supplierSKU, params.inventory, params.purchaseOrders, {
        ignorePurchaseOrderId: params.ignorePurchaseOrderId,
        ignoreInventoryId: params.ignoreInventoryId,
      })
    : undefined;

  if (linked) {
    params.batchReservations?.set(supKey, linked);
    return linked;
  }

  const pool = [
    ...collectUsedSkus(params.inventory, params.purchaseOrders, {
      ignorePurchaseOrderId: params.ignorePurchaseOrderId,
    }),
    ...(params.extraUsedSkus ?? []),
    ...Array.from(params.batchReservations?.values() ?? []),
  ];

  const generated = generateUniqueSKU(params.category, params.line, pool);
  if (supKey) {
    params.batchReservations?.set(supKey, generated);
  }
  return generated;
}

/** @deprecated Usar generateUniqueSKU(category, line, existingSkus). */
export function generateSKU(category: string, line: string, _supplierSKU: string = ''): string {
  return buildSkuBase(category, line, []);
}

export function formatSKU(sku: string): string {
  if (sku.length >= 4) {
    return `${sku.substring(0, 4)}-${sku.substring(4)}`;
  }
  return sku;
}

export function collectUsedSkus(
  inventory: { sku: string }[],
  purchaseOrders: { sku: string; id?: string }[],
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
