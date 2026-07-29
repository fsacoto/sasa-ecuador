import type { InventoryItem, BillOfMaterialsLine } from '../types';
import { isMaterialCategory, roundMaterialQty } from './materials';
import { resolveSkuUnitCost } from './landedCostCalculation';
import type { AdditionalCost, PurchaseOrder } from '../types';

export type BuildComponentInput = {
  inventoryId: string;
  sku: string;
  quantityPerUnit: number;
};

/** Canonical signature so the same recipe reuses the same finished SKU. */
export function buildBomSignature(components: Array<{ sku: string; quantityPerUnit: number }>): string {
  const parts = components
    .filter((c) => c.sku.trim() && c.quantityPerUnit > 0)
    .map((c) => ({
      sku: c.sku.trim().toUpperCase(),
      qty: roundMaterialQty(c.quantityPerUnit),
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku) || a.qty - b.qty)
    .map((c) => `${c.sku}:${c.qty.toFixed(3)}`);
  return parts.join('|');
}

export function findInventoryByBomSignature(
  inventory: InventoryItem[],
  signature: string
): InventoryItem | undefined {
  const sig = (signature || '').trim();
  if (!sig) return undefined;
  return inventory.find((item) => (item.bomSignature || '').trim() === sig);
}

/** True when the item was created/updated via Construir producto. */
export function isBuiltInventoryItem(item: InventoryItem | null | undefined): boolean {
  if (!item) return false;
  if (item.billOfMaterials && item.billOfMaterials.length > 0) return true;
  return Boolean((item.bomSignature || '').trim());
}

/**
 * Inventory available as build components: materials, cadenas, aretes, etc. with stock.
 * Excludes the finished product category restriction — any on-hand SKU can be consumed.
 */
export function getBuildableInventory(inventory: InventoryItem[]): InventoryItem[] {
  return inventory.filter((item) => (item.ecuadorStock ?? 0) > 0);
}

/** @deprecated Prefer getBuildableInventory — kept for callers that only want Materiales. */
export function getMaterialInventory(inventory: InventoryItem[]): InventoryItem[] {
  return inventory.filter(
    (item) => isMaterialCategory(item.category) && (item.ecuadorStock ?? 0) > 0
  );
}

/** Collect component photos for the built record (never used as display `images`). */
export function collectComponentSourceImages(
  components: BuildComponentInput[],
  inventory: InventoryItem[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of components) {
    const item = inventory.find((i) => i.id === c.inventoryId || i.sku === c.sku);
    if (!item) continue;
    for (const url of item.images ?? []) {
      const trimmed = (url || '').trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

export function mergeSourceImages(
  existing: string[] | undefined,
  incoming: string[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [...(existing ?? []), ...incoming]) {
    const trimmed = (url || '').trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export type BuildCostLine = {
  inventoryId: string;
  sku: string;
  quantityPerUnit: number;
  unitCost: number | null;
  lineCost: number | null;
};

export type BuildCostResult = {
  lines: BuildCostLine[];
  unitCost: number | null;
  missingCostSkus: string[];
};

export function calculateBuildUnitCost(
  components: BuildComponentInput[],
  inventory: InventoryItem[],
  purchaseOrders: PurchaseOrder[],
  additionalCosts: AdditionalCost[]
): BuildCostResult {
  const lines: BuildCostLine[] = [];
  const missingCostSkus: string[] = [];
  let sum = 0;
  let allHaveCost = true;

  for (const c of components) {
    if (!(c.quantityPerUnit > 0)) continue;
    const { unitCost } = resolveSkuUnitCost(c.sku, inventory, purchaseOrders, additionalCosts);
    const material = inventory.find((i) => i.id === c.inventoryId || i.sku === c.sku);
    const effective =
      unitCost ??
      (material?.unitCost != null && Number.isFinite(material.unitCost) ? material.unitCost : null);

    if (effective == null) {
      allHaveCost = false;
      missingCostSkus.push(c.sku);
      lines.push({
        inventoryId: c.inventoryId,
        sku: c.sku,
        quantityPerUnit: c.quantityPerUnit,
        unitCost: null,
        lineCost: null,
      });
      continue;
    }

    const lineCost = roundMoney(effective * c.quantityPerUnit);
    sum += lineCost;
    lines.push({
      inventoryId: c.inventoryId,
      sku: c.sku,
      quantityPerUnit: c.quantityPerUnit,
      unitCost: effective,
      lineCost,
    });
  }

  return {
    lines,
    unitCost: allHaveCost && lines.length > 0 ? roundMoney(sum) : null,
    missingCostSkus,
  };
}

function roundMoney(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export type BuildValidationError =
  | { code: 'no_components' }
  | { code: 'invalid_qty_produced' }
  | { code: 'insufficient_stock'; sku: string; needed: number; available: number }
  | { code: 'missing_category_line' };

export function validateBuild(
  components: BuildComponentInput[],
  quantityProduced: number,
  inventory: InventoryItem[],
  category: string,
  line: string
): BuildValidationError | null {
  if (!category.trim() || !line.trim()) return { code: 'missing_category_line' };
  if (!(quantityProduced > 0) || !Number.isFinite(quantityProduced)) {
    return { code: 'invalid_qty_produced' };
  }
  const usable = components.filter((c) => c.quantityPerUnit > 0 && c.inventoryId);
  if (usable.length === 0) return { code: 'no_components' };

  for (const c of usable) {
    const item = inventory.find((i) => i.id === c.inventoryId);
    if (!item) {
      return { code: 'insufficient_stock', sku: c.sku, needed: c.quantityPerUnit * quantityProduced, available: 0 };
    }
    const needed = roundMaterialQty(c.quantityPerUnit * quantityProduced);
    const available = roundMaterialQty(item.ecuadorStock ?? 0);
    if (available + 1e-9 < needed) {
      return { code: 'insufficient_stock', sku: item.sku, needed, available };
    }
  }
  return null;
}

export function toBillOfMaterialsLines(
  components: BuildComponentInput[],
  costLines: BuildCostLine[]
): BillOfMaterialsLine[] {
  return components
    .filter((c) => c.quantityPerUnit > 0)
    .map((c) => {
      const cost = costLines.find((l) => l.inventoryId === c.inventoryId || l.sku === c.sku);
      return {
        inventoryId: c.inventoryId,
        sku: c.sku,
        quantityPerUnit: roundMaterialQty(c.quantityPerUnit),
        unitCostAtBuild: cost?.unitCost ?? undefined,
      };
    });
}

/** Weighted average unit cost when adding more stock of an existing built item. */
export function mergeUnitCost(
  existingStock: number,
  existingUnitCost: number | null | undefined,
  addQty: number,
  addUnitCost: number | null
): number | null {
  if (addUnitCost == null) return existingUnitCost ?? null;
  const oldStock = Math.max(0, existingStock);
  const oldCost = existingUnitCost;
  if (oldStock <= 0 || oldCost == null) return addUnitCost;
  return roundMoney((oldStock * oldCost + addQty * addUnitCost) / (oldStock + addQty));
}

/** One component line to restore when deleting a built finished product. */
export type BuildStockRestoreLine = {
  inventoryId: string;
  sku: string;
  quantity: number;
  found: boolean;
};

/**
 * Quantities to return to component stock when deleting a built item:
 * quantityPerUnit × finished ecuadorStock for each BOM line.
 */
export function computeBuildStockRestore(
  builtItem: InventoryItem,
  inventory: InventoryItem[]
): BuildStockRestoreLine[] {
  const qtyFinished = roundMaterialQty(Math.max(0, builtItem.ecuadorStock ?? 0));
  const bom = builtItem.billOfMaterials ?? [];
  if (!(qtyFinished > 0) || bom.length === 0) return [];

  const merged = new Map<string, BuildStockRestoreLine>();
  for (const line of bom) {
    if (!(line.quantityPerUnit > 0)) continue;
    const restoreQty = roundMaterialQty(line.quantityPerUnit * qtyFinished);
    if (!(restoreQty > 0)) continue;

    const component =
      inventory.find((i) => i.id === line.inventoryId) ||
      inventory.find((i) => i.sku === line.sku);
    const key = component?.id || line.inventoryId || line.sku;
    const prev = merged.get(key);
    if (prev) {
      prev.quantity = roundMaterialQty(prev.quantity + restoreQty);
      continue;
    }
    merged.set(key, {
      inventoryId: component?.id || line.inventoryId,
      sku: component?.sku || line.sku,
      quantity: restoreQty,
      found: Boolean(component),
    });
  }
  return [...merged.values()].sort((a, b) => a.sku.localeCompare(b.sku));
}

/** Human-readable restore list for delete confirmation dialogs. */
export function formatBuildStockRestoreLines(lines: BuildStockRestoreLine[]): string {
  if (lines.length === 0) return '';
  return lines
    .map((l) => `• ${l.sku}: +${l.quantity}${l.found ? '' : ' (no encontrado)'}`)
    .join('\n');
}
