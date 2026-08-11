import { ConsignmentItem, ConsignmentStatus, InventoryItem, SalesInvoice } from '../types';
import { getConsignment, updateConsignment, deleteField } from '../services/consignmentsService';
import { deleteInvoice } from '../services/invoicesService';
import {
  getDeliveredQtyForStock,
  getUndeliveredQty,
} from './stockReservation';
import { reverseSaleQuantitiesOnItems } from './consignmentSales';

export type InvoiceDeleteReturnItem = {
  description: string;
  sku: string;
  quantity: number;
  currentStock: number;
  newStock: number;
  kind: 'ecuador' | 'consignment';
};

function consignmentStatusFromItems(items: ConsignmentItem[]): ConsignmentStatus {
  const totalDelivered = items.reduce((sum, item) => sum + item.quantityDelivered, 0);
  const totalSold = items.reduce((sum, item) => sum + item.quantitySold, 0);
  const totalReturned = items.reduce((sum, item) => sum + item.quantityReturned, 0);
  const totalAccounted = totalSold + totalReturned;
  if (totalAccounted >= totalDelivered) return 'Closed';
  if (totalAccounted > 0) return 'Partially Closed';
  return 'Open';
}

/** Physical stock that can optionally be restored on delete (delivered / consignment). */
export function buildDeleteReturnItems(
  invoice: SalesInvoice,
  inventory: InventoryItem[]
): InvoiceDeleteReturnItem[] {
  const items: InvoiceDeleteReturnItem[] = [];

  if (invoice.sourceConsignmentFirestoreId) {
    invoice.items.forEach((item) => {
      const inventoryItem = inventory.find((inv) => inv.sku === item.sku);
      if (!inventoryItem) return;
      const currentStock = inventoryItem.consignmentStock || 0;
      items.push({
        description: item.description,
        sku: item.sku,
        quantity: item.quantity,
        currentStock,
        newStock: currentStock + item.quantity,
        kind: 'consignment',
      });
    });
    return items;
  }

  invoice.items.forEach((item) => {
    const delivered = getDeliveredQtyForStock(invoice, item);
    if (delivered <= 0) return;
    const inventoryItem = inventory.find((inv) => inv.sku === item.sku);
    if (!inventoryItem) return;
    const currentStock = inventoryItem.ecuadorStock;
    items.push({
      description: item.description,
      sku: item.sku,
      quantity: delivered,
      currentStock,
      newStock: currentStock + delivered,
      kind: 'ecuador',
    });
  });

  return items;
}

async function restoreConsignmentStockBySku(
  qtyBySku: Map<string, number>,
  inventory: InventoryItem[],
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>
) {
  for (const [sku, quantity] of qtyBySku) {
    if (quantity <= 0) continue;
    const inventoryItem = inventory.find((inv) => inv.sku === sku);
    if (!inventoryItem) continue;
    const current = inventoryItem.consignmentStock || 0;
    await updateInventoryItem(inventoryItem.id, {
      consignmentStock: current + quantity,
    });
  }
}

/**
 * Deletes a sales note. For consignment-linked notes, reverting stock returns
 * units to consignmentStock (still on the consignación) — never ecuadorStock.
 */
export async function deleteSalesInvoiceWithStockRevert(
  invoice: SalesInvoice,
  itemsToReturn: InvoiceDeleteReturnItem[],
  revertInventory: boolean,
  inventory: InventoryItem[],
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>
): Promise<void> {
  // Always release reservations for undelivered units on non-consignment notes.
  if (!invoice.sourceConsignmentFirestoreId) {
    const reservationDeltas = new Map<string, number>();
    for (const item of invoice.items) {
      const undelivered = getUndeliveredQty(invoice, item);
      if (undelivered <= 0) continue;
      reservationDeltas.set(item.sku, (reservationDeltas.get(item.sku) ?? 0) + undelivered);
    }
    const reservedOverrides = new Map<string, number>();
    for (const [sku, releaseQty] of reservationDeltas) {
      const inventoryItem = inventory.find((inv) => inv.sku === sku);
      if (!inventoryItem) continue;
      const current =
        reservedOverrides.get(inventoryItem.id) ?? Number(inventoryItem.reservedStock ?? 0);
      const next = Math.max(0, current - releaseQty);
      reservedOverrides.set(inventoryItem.id, next);
      await updateInventoryItem(inventoryItem.id, {
        reservedStock: next,
      });
    }
  }

  if (invoice.sourceConsignmentFirestoreId) {
    const consignment = await getConsignment(invoice.sourceConsignmentFirestoreId);
    if (consignment) {
      if (revertInventory) {
        const invoicedSales = (consignment.sales || []).filter(
          (s) => !s.reversed && s.invoiced
        );
        let updatedItems = consignment.items;
        const qtyBySku = new Map<string, number>();

        if (invoicedSales.length > 0) {
          const nextSales = (consignment.sales || []).map((s) =>
            !s.reversed && s.invoiced
              ? { ...s, reversed: true, reversedAt: new Date(), invoiced: false }
              : s
          );
          for (const sale of invoicedSales) {
            updatedItems = reverseSaleQuantitiesOnItems(updatedItems, sale.lines);
            for (const line of sale.lines) {
              qtyBySku.set(
                line.sku,
                (qtyBySku.get(line.sku) || 0) + (line.quantity || 0)
              );
            }
          }
          await updateConsignment(consignment.id, {
            items: updatedItems,
            status: consignmentStatusFromItems(updatedItems),
            sales: nextSales,
            linkedSalesInvoiceId: deleteField(),
            linkedSalesInvoiceNumber: deleteField(),
          });
        } else {
          // Legacy notes without sale records: undo sold qty from invoice lines
          updatedItems = consignment.items.map((cItem) => {
            const matching = invoice.items.filter((i) => i.sku === cItem.sku);
            if (matching.length === 0) return cItem;
            const deduct = matching.reduce((sum, line) => sum + (line.quantity || 0), 0);
            return {
              ...cItem,
              quantitySold: Math.max(0, cItem.quantitySold - deduct),
            };
          });
          for (const line of invoice.items) {
            qtyBySku.set(
              line.sku,
              (qtyBySku.get(line.sku) || 0) + (line.quantity || 0)
            );
          }
          await updateConsignment(consignment.id, {
            items: updatedItems,
            status: consignmentStatusFromItems(updatedItems),
            linkedSalesInvoiceId: deleteField(),
            linkedSalesInvoiceNumber: deleteField(),
          });
        }

        // Return units to consignment stock (still on the consignación)
        await restoreConsignmentStockBySku(qtyBySku, inventory, updateInventoryItem);
      } else {
        // Keep quantitySold / consignmentStock; allow re-emitting a new note.
        const nextSales = (consignment.sales || []).map((s) =>
          s.invoiced && !s.reversed ? { ...s, invoiced: false } : s
        );
        await updateConsignment(consignment.id, {
          ...(nextSales.length > 0 ? { sales: nextSales } : {}),
          linkedSalesInvoiceId: deleteField(),
          linkedSalesInvoiceNumber: deleteField(),
        });
      }
    }
  } else if (revertInventory && itemsToReturn.length > 0) {
    for (const itemReturn of itemsToReturn) {
      if (itemReturn.kind !== 'ecuador') continue;
      const inventoryItem = inventory.find((inv) => inv.sku === itemReturn.sku);
      if (inventoryItem) {
        await updateInventoryItem(inventoryItem.id, {
          ecuadorStock: (inventoryItem.ecuadorStock || 0) + itemReturn.quantity,
        });
      }
    }
  }

  await deleteInvoice(invoice.id);
}
