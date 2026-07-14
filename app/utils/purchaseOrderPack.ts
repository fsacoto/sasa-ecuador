import type { PurchaseOrder } from '../types';

/** unitsPerPack if > 1, otherwise 1. */
export function effectiveUnitsPerPack(
  order: Pick<PurchaseOrder, 'unitsPerPack'> | { unitsPerPack?: number | null }
): number {
  const n = Number(order.unitsPerPack);
  if (!Number.isFinite(n) || n < 2) return 1;
  return Math.floor(n);
}

export function isPackBased(
  order: Pick<PurchaseOrder, 'unitsPerPack'> | { unitsPerPack?: number | null }
): boolean {
  return effectiveUnitsPerPack(order) > 1;
}

/** Saleable units expected for labels, scanner, and verification. */
export function expectedSaleableQuantity(
  order: Pick<PurchaseOrder, 'quantity' | 'unitsPerPack'>
): number {
  const qty = Math.max(0, Number(order.quantity) || 0);
  const perPack = effectiveUnitsPerPack(order);
  return perPack > 1 ? qty * perPack : qty;
}

/**
 * Extra barcode labels for pack lines beyond the original PO quantity
 * (saleable − ordered packs). Reprintable; 0 for unit lines.
 */
export function boxSetExtraLabelCount(
  order: Pick<PurchaseOrder, 'quantity' | 'unitsPerPack'>
): number {
  if (!isPackBased(order)) return 0;
  return Math.max(0, expectedSaleableQuantity(order) - Math.max(0, Number(order.quantity) || 0));
}

/** Denominator for landed / unit cost (saleable units). */
export function costAllocationUnits(
  order: Pick<PurchaseOrder, 'quantity' | 'unitsPerPack'>
): number {
  const n = expectedSaleableQuantity(order);
  return n > 0 ? n : 1;
}

/** Recompute landedCostPerUnit from totalLandedCost ÷ saleables. */
export function landedCostPerSaleableUnit(
  order: Pick<PurchaseOrder, 'quantity' | 'unitsPerPack' | 'totalLandedCost'>
): number {
  const total = Number(order.totalLandedCost) || 0;
  return total / costAllocationUnits(order);
}

/** Normalize a unitsPerPack edit: null/undefined/≤1 → clear; ≥2 → integer pack size. */
export function normalizeUnitsPerPackInput(
  value: number | null | undefined
): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 2) return null;
  return Math.floor(n);
}
