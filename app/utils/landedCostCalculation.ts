import type {
  AdditionalCost,
  InventoryItem,
  LandedCostCalculation,
  PurchaseOrder,
} from '../types';
import { costAllocationUnits } from './purchaseOrderPack';

export function getAdditionalCostsForInvoice(
  invoiceNumber: string,
  additionalCosts: AdditionalCost[]
): AdditionalCost[] {
  return additionalCosts.filter((cost) => cost.invoiceNumber === invoiceNumber);
}

export function calculateLandedCostsForInvoice(
  invoiceNumber: string,
  purchaseOrders: PurchaseOrder[],
  additionalCosts: AdditionalCost[]
): LandedCostCalculation | null {
  const invoiceOrders = purchaseOrders.filter((order) => order.invoice === invoiceNumber);
  if (invoiceOrders.length === 0) return null;

  const costs = getAdditionalCostsForInvoice(invoiceNumber, additionalCosts);
  const totalAdditionalCosts = costs.reduce((sum, cost) => sum + cost.amount, 0);
  const baseItemTotal = invoiceOrders.reduce((sum, order) => sum + order.costInUSD, 0);

  const items = invoiceOrders.map((order) => {
    const proportionalShare = baseItemTotal > 0 ? order.costInUSD / baseItemTotal : 0;
    const additionalCostAllocation = totalAdditionalCosts * proportionalShare;
    const qty = costAllocationUnits(order);
    const finalCostPerUnit = order.costInUSD / qty + additionalCostAllocation / qty;
    const finalItemTotal = order.costInUSD + additionalCostAllocation;

    return {
      purchaseOrderId: order.id,
      sku: order.sku,
      description: order.description,
      quantity: order.quantity,
      baseCostPerUnit: order.costInUSD / qty,
      baseItemTotal: order.costInUSD,
      proportionalShare: proportionalShare * 100,
      additionalCostAllocation,
      finalCostPerUnit,
      finalItemTotal,
    };
  });

  return {
    invoiceNumber,
    baseItemTotal,
    totalAdditionalCosts,
    totalLandedCost: baseItemTotal + totalAdditionalCosts,
    items,
  };
}

/** Lookup rápido: purchaseOrderId → finalCostPerUnit (desembarque completo). */
export function buildFinalCostByPurchaseOrderId(
  purchaseOrders: PurchaseOrder[],
  additionalCosts: AdditionalCost[]
): Map<string, number> {
  const map = new Map<string, number>();
  const invoiceNumbers = Array.from(new Set(purchaseOrders.map((o) => o.invoice)));

  for (const invoiceNumber of invoiceNumbers) {
    const calc = calculateLandedCostsForInvoice(invoiceNumber, purchaseOrders, additionalCosts);
    if (!calc) continue;
    for (const item of calc.items) {
      map.set(item.purchaseOrderId, item.finalCostPerUnit);
    }
  }

  return map;
}

export type SkuUnitCostResult = {
  unitCost: number | null;
  sourcePoCount: number;
};

/**
 * Costo unitario de desembarque para un SKU: promedio ponderado por cantidad
 * de las OC verificadas vinculadas al producto en inventario.
 * Productos construidos (BOM) usan `unitCost` guardado en el ítem.
 */
export function resolveSkuUnitCost(
  sku: string,
  inventory: InventoryItem[],
  purchaseOrders: PurchaseOrder[],
  additionalCosts: AdditionalCost[]
): SkuUnitCostResult {
  const product = inventory.find((item) => item.sku === sku);
  if (!product) {
    return { unitCost: null, sourcePoCount: 0 };
  }

  if (
    product.billOfMaterials &&
    product.billOfMaterials.length > 0 &&
    product.unitCost != null &&
    Number.isFinite(product.unitCost)
  ) {
    return { unitCost: product.unitCost, sourcePoCount: 0 };
  }

  if (product.linkedPurchaseOrders.length === 0) {
    if (product.unitCost != null && Number.isFinite(product.unitCost)) {
      return { unitCost: product.unitCost, sourcePoCount: 0 };
    }
    return { unitCost: null, sourcePoCount: 0 };
  }

  const finalCostByPoId = buildFinalCostByPurchaseOrderId(purchaseOrders, additionalCosts);
  const linkedVerified = purchaseOrders.filter(
    (po) => product.linkedPurchaseOrders.includes(po.id) && po.status === 'Verified'
  );

  if (linkedVerified.length === 0) {
    if (product.unitCost != null && Number.isFinite(product.unitCost)) {
      return { unitCost: product.unitCost, sourcePoCount: 0 };
    }
    return { unitCost: null, sourcePoCount: 0 };
  }

  let weightedSum = 0;
  let totalQty = 0;
  let counted = 0;

  for (const po of linkedVerified) {
    const finalCost = finalCostByPoId.get(po.id);
    if (finalCost == null) continue;
    const qty = costAllocationUnits(po);
    weightedSum += finalCost * qty;
    totalQty += qty;
    counted += 1;
  }

  if (counted === 0 || totalQty === 0) {
    if (product.unitCost != null && Number.isFinite(product.unitCost)) {
      return { unitCost: product.unitCost, sourcePoCount: 0 };
    }
    return { unitCost: null, sourcePoCount: 0 };
  }

  return { unitCost: weightedSum / totalQty, sourcePoCount: counted };
}
