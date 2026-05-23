import { ConsignmentItem, ConsignmentStatus, InventoryItem, SalesInvoice } from '../types';
import { getConsignment, updateConsignment } from '../services/consignmentsService';
import { deleteInvoice } from '../services/invoicesService';

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

  const wasDelivered =
    invoice.deliveryStatus === 'Delivered' || invoice.deliveryStatus === 'Partially Delivered';
  if (!wasDelivered) return items;

  invoice.items.forEach((item) => {
    const inventoryItem = inventory.find((inv) => inv.sku === item.sku);
    if (!inventoryItem) return;
    const currentStock = inventoryItem.ecuadorStock;
    items.push({
      description: item.description,
      sku: item.sku,
      quantity: item.quantity,
      currentStock,
      newStock: currentStock + item.quantity,
      kind: 'ecuador',
    });
  });
  return items;
}

export async function deleteSalesInvoiceWithStockRevert(
  invoice: SalesInvoice,
  itemsToReturn: InvoiceDeleteReturnItem[],
  revertInventory: boolean,
  inventory: InventoryItem[],
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>
): Promise<void> {
  if (revertInventory && itemsToReturn.length > 0) {
    const isConsignment = itemsToReturn.some((i) => i.kind === 'consignment');

    if (isConsignment && invoice.sourceConsignmentFirestoreId) {
      const consignment = await getConsignment(invoice.sourceConsignmentFirestoreId);
      if (consignment) {
        const updatedItems = consignment.items.map((cItem) => {
          const line = invoice.items.find((i) => i.sku === cItem.sku);
          if (!line) return cItem;
          return {
            ...cItem,
            quantitySold: Math.max(0, cItem.quantitySold - line.quantity),
          };
        });
        await updateConsignment(consignment.id, {
          items: updatedItems,
          status: consignmentStatusFromItems(updatedItems),
        });
      }
      for (const itemReturn of itemsToReturn) {
        const inventoryItem = inventory.find((inv) => inv.sku === itemReturn.sku);
        if (inventoryItem) {
          await updateInventoryItem(inventoryItem.id, {
            consignmentStock: itemReturn.newStock,
          });
        }
      }
    } else {
      for (const itemReturn of itemsToReturn) {
        if (itemReturn.kind !== 'ecuador') continue;
        const inventoryItem = inventory.find((inv) => inv.sku === itemReturn.sku);
        if (inventoryItem) {
          await updateInventoryItem(inventoryItem.id, {
            ecuadorStock: itemReturn.newStock,
          });
        }
      }
    }
  }

  await deleteInvoice(invoice.id);
}
