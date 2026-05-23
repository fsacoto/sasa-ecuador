import type { PurchaseOrder } from '../types';

export const BULK_IMPORT_EDIT_COLUMNS = [
  'invoice',
  'supplierSKU',
  'supplier',
  'description',
  'quantity',
  'costPerUnit',
  'totalCost',
  'category',
  'line',
] as const;

export type BulkImportEditColumn = (typeof BULK_IMPORT_EDIT_COLUMNS)[number];

export type BulkImportGroup = {
  id: string;
  label: string;
  invoice: string;
  rowCount: number;
  importedAt: Date;
};

const LEGACY_PREFIX = 'legacy-invoice:';

export function isLegacyBulkImportGroupId(groupId: string): boolean {
  return groupId.startsWith(LEGACY_PREFIX);
}

export function legacyBulkImportInvoiceFromGroupId(groupId: string): string {
  return groupId.slice(LEGACY_PREFIX.length);
}

/** Groups bulk imports that still exist as purchase orders in the system. */
export function listBulkImportGroups(purchaseOrders: PurchaseOrder[]): BulkImportGroup[] {
  const byBulkId = new Map<string, PurchaseOrder[]>();
  const byInvoiceLegacy = new Map<string, PurchaseOrder[]>();

  for (const po of purchaseOrders) {
    if (po.bulkImportId) {
      const list = byBulkId.get(po.bulkImportId) ?? [];
      list.push(po);
      byBulkId.set(po.bulkImportId, list);
    }
  }

  for (const po of purchaseOrders) {
    if (po.bulkImportId) continue;
    const inv = po.invoice?.trim();
    if (!inv) continue;
    const list = byInvoiceLegacy.get(inv) ?? [];
    list.push(po);
    byInvoiceLegacy.set(inv, list);
  }

  const groups: BulkImportGroup[] = [];

  for (const [id, orders] of byBulkId) {
    const sorted = [...orders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const label = sorted[0].bulkImportLabel?.trim() || sorted[0].invoice;
    groups.push({
      id,
      label,
      invoice: sorted[0].invoice,
      rowCount: sorted.length,
      importedAt: sorted[0].createdAt,
    });
  }

  for (const [invoice, orders] of byInvoiceLegacy) {
    if (orders.length < 2) continue;
    const sorted = [...orders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    groups.push({
      id: `${LEGACY_PREFIX}${invoice}`,
      label: invoice,
      invoice,
      rowCount: sorted.length,
      importedAt: sorted[0].createdAt,
    });
  }

  groups.sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime());
  return groups;
}

export function getPurchaseOrdersForBulkImportGroup(
  purchaseOrders: PurchaseOrder[],
  groupId: string
): PurchaseOrder[] {
  if (isLegacyBulkImportGroupId(groupId)) {
    const invoice = legacyBulkImportInvoiceFromGroupId(groupId);
    return purchaseOrders
      .filter((po) => !po.bulkImportId && po.invoice === invoice)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  return purchaseOrders
    .filter((po) => po.bulkImportId === groupId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
