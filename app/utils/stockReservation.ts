import type { InventoryItem, SalesInvoice, SalesInvoiceLine } from '../types';

const OPEN_DELIVERY_STATUSES: SalesInvoice['deliveryStatus'][] = [
  'Pending',
  'Partially Delivered',
];

export function getReservedStock(
  item: Pick<InventoryItem, 'reservedStock'> | null | undefined
): number {
  const n = Number(item?.reservedStock ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Units free to sell / reserve on a new note (physical on-hand minus holds). */
export function getAvailableStock(
  item: Pick<InventoryItem, 'ecuadorStock' | 'reservedStock'> | null | undefined
): number {
  if (!item) return 0;
  const onHand = Number(item.ecuadorStock ?? 0);
  if (!Number.isFinite(onHand)) return 0;
  return Math.max(0, onHand - getReservedStock(item));
}

export function clampReservedStock(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** Undelivered units still held by this invoice line. */
export function getUndeliveredQty(
  invoice: Pick<SalesInvoice, 'deliveryStatus'>,
  item: SalesInvoiceLine
): number {
  if (invoice.deliveryStatus === 'Canceled' || invoice.deliveryStatus === 'Delivered') {
    return 0;
  }

  const ordered = Math.max(0, Number(item.quantity) || 0);
  let delivered = 0;
  if (typeof item.quantityDelivered === 'number') {
    delivered = Math.min(ordered, Math.max(0, item.quantityDelivered));
  }
  return Math.max(0, ordered - delivered);
}

/** Units already deducted from ecuadorStock for this line. */
export function getDeliveredQtyForStock(
  invoice: Pick<SalesInvoice, 'deliveryStatus'>,
  item: SalesInvoiceLine
): number {
  const ordered = Math.max(0, Number(item.quantity) || 0);
  if (typeof item.quantityDelivered === 'number') {
    return Math.min(ordered, Math.max(0, item.quantityDelivered));
  }
  if (invoice.deliveryStatus === 'Delivered') return ordered;
  return 0;
}

export function isOpenSalesReservation(
  invoice: Pick<SalesInvoice, 'deliveryStatus' | 'sourceConsignmentFirestoreId'>
): boolean {
  if (invoice.sourceConsignmentFirestoreId) return false;
  return OPEN_DELIVERY_STATUSES.includes(invoice.deliveryStatus);
}

/** Sum undelivered qty per SKU across open (non-consignment) sales notes. */
export function computeReservedBySkuFromInvoices(
  invoices: SalesInvoice[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const invoice of invoices) {
    if (!isOpenSalesReservation(invoice)) continue;
    for (const item of invoice.items) {
      const undelivered = getUndeliveredQty(invoice, item);
      if (undelivered <= 0) continue;
      const sku = item.sku?.trim();
      if (!sku) continue;
      map.set(sku, (map.get(sku) ?? 0) + undelivered);
    }
  }
  return map;
}

/** Open note numbers that still hold units of a SKU. */
export function getOpenReservationNotesForSku(
  invoices: SalesInvoice[],
  sku: string
): { invoiceNumber: string; quantity: number }[] {
  const target = sku.trim();
  if (!target) return [];
  const notes: { invoiceNumber: string; quantity: number }[] = [];
  for (const invoice of invoices) {
    if (!isOpenSalesReservation(invoice)) continue;
    let qty = 0;
    for (const item of invoice.items) {
      if (item.sku?.trim() !== target) continue;
      qty += getUndeliveredQty(invoice, item);
    }
    if (qty > 0) {
      notes.push({ invoiceNumber: invoice.invoiceNumber, quantity: qty });
    }
  }
  return notes;
}

export function nextReservedStock(
  item: Pick<InventoryItem, 'reservedStock'>,
  delta: number
): number {
  return clampReservedStock(getReservedStock(item) + delta);
}

/**
 * Align inventory.reservedStock with undelivered lines on open sales notes.
 * Safe to run on hub load; heals drift and backfills existing Pending notes.
 */
export async function reconcileReservedStockFromInvoices(
  inventory: InventoryItem[],
  invoices: SalesInvoice[],
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>
): Promise<number> {
  const desired = computeReservedBySkuFromInvoices(invoices);
  let updates = 0;

  for (const item of inventory) {
    const sku = item.sku?.trim();
    if (!sku) continue;
    const target = clampReservedStock(desired.get(sku) ?? 0);
    const current = getReservedStock(item);
    if (current === target) continue;
    await updateInventoryItem(item.id, { reservedStock: target });
    updates += 1;
  }

  return updates;
}
