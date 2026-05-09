import { PurchaseOrder, InventoryItem } from '../types';

/** One printable line: always tied to a PO; barcode may come from PO or inventory. */
export interface BarcodePrintRow {
  order: PurchaseOrder;
  inventoryItem: InventoryItem | null;
  barcodeUrl: string;
}

export function findInventoryForPurchaseOrder(
  order: PurchaseOrder,
  inventory: InventoryItem[]
): InventoryItem | undefined {
  const linked = inventory.find((i) => i.linkedPurchaseOrders?.includes(order.id));
  if (linked) return linked;
  if (order.sku) {
    return inventory.find((i) => i.sku === order.sku);
  }
  return undefined;
}

export function resolveBarcodeUrlForPrint(
  order: PurchaseOrder,
  inventoryItem?: InventoryItem | null
): string {
  const u = (order.barcode || inventoryItem?.barcode || '').trim();
  return u;
}

export function syntheticInventoryFromOrder(
  order: PurchaseOrder,
  barcodeUrl: string
): InventoryItem {
  return {
    id: `__po__${order.id}`,
    name: order.description,
    supplierSKU: order.supplierSKU || '',
    linkedPurchaseOrders: [order.id],
    sku: order.sku,
    description: order.description,
    category: order.category || '',
    line: order.line || '',
    ecuadorStock: 0,
    consignmentStock: 0,
    images: order.images || [],
    barcode: barcodeUrl,
    createdAt: order.createdAt,
  };
}

/** Inventory row for PDF: real row with merged barcode, or synthetic from PO. */
export function buildInventoryForPdfLabel(row: BarcodePrintRow): InventoryItem {
  if (row.inventoryItem) {
    return { ...row.inventoryItem, barcode: row.barcodeUrl };
  }
  return syntheticInventoryFromOrder(row.order, row.barcodeUrl);
}

/**
 * How many labels for "full" mode: on-hand stock if inventory exists, else PO quantities.
 */
export function labelCountForFullPrint(
  order: PurchaseOrder,
  inventoryItem: InventoryItem | null
): number {
  if (inventoryItem) {
    const n =
      (inventoryItem.ecuadorStock || 0) +
      (inventoryItem.consignmentStock || 0);
    if (n > 0) return n;
  }
  const st = String(order.status).trim().toLowerCase();
  if (st === 'verified') {
    const g = Number(order.quantityGood) || 0;
    const p = Number(order.quantityProblem) || 0;
    if (g + p > 0) return Math.max(1, g + p);
    const rec = Number(order.quantityReceived) || 0;
    if (rec > 0) return rec;
  }
  const q = Number(order.quantity) || 0;
  return Math.max(1, q);
}

export function buildPrintRowsByInvoice(
  purchaseOrders: PurchaseOrder[],
  inventory: InventoryItem[]
): Record<string, { rows: BarcodePrintRow[]; orders: PurchaseOrder[] }> {
  const map: Record<string, { rows: BarcodePrintRow[]; orders: PurchaseOrder[] }> = {};

  purchaseOrders.forEach((order) => {
    const invoiceKey = order.invoice || '—';
    if (!map[invoiceKey]) {
      map[invoiceKey] = { rows: [], orders: [] };
    }
    if (!map[invoiceKey].orders.some((o) => o.id === order.id)) {
      map[invoiceKey].orders.push(order);
    }
    const invItem = findInventoryForPurchaseOrder(order, inventory);
    const barcodeUrl = resolveBarcodeUrlForPrint(order, invItem);
    if (!barcodeUrl) return;
    map[invoiceKey].rows.push({
      order,
      inventoryItem: invItem ?? null,
      barcodeUrl,
    });
  });

  return map;
}

export function buildAllPrintRows(
  purchaseOrders: PurchaseOrder[],
  inventory: InventoryItem[]
): BarcodePrintRow[] {
  const byInvoice = buildPrintRowsByInvoice(purchaseOrders, inventory);
  const flat: BarcodePrintRow[] = [];
  Object.values(byInvoice).forEach((entry) => {
    entry.rows.forEach((r) => flat.push(r));
  });
  flat.sort((a, b) => {
    const inv = (a.order.invoice || '').localeCompare(b.order.invoice || '');
    if (inv !== 0) return inv;
    return (a.order.description || '').localeCompare(b.order.description || '');
  });
  return flat;
}
