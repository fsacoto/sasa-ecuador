// Smart update functions to keep Purchase Orders and Inventory in sync

import { PurchaseOrder, InventoryItem } from '../types';

export function syncPurchaseOrderToInventory(
  updatedOrder: PurchaseOrder,
  inventory: InventoryItem[],
  updateInventoryItem: (id: string, item: Partial<InventoryItem>) => void,
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'createdAt'>) => void,
  previousSku?: string
) {
  // If SKU changed, find inventory item by the old SKU or by linked purchase orders
  let inventoryItem = inventory.find(item => item.sku === updatedOrder.sku);
  
  // If not found by current SKU, try finding by previous SKU or by linked purchase orders
  if (!inventoryItem && previousSku) {
    inventoryItem = inventory.find(item => item.sku === previousSku);
  }
  
  // If still not found, try finding by linked purchase orders
  if (!inventoryItem) {
    inventoryItem = inventory.find(item => 
      item.linkedPurchaseOrders.includes(updatedOrder.id)
    );
  }

  if (inventoryItem) {
    // Update existing inventory item
    const updates: Partial<InventoryItem> = {};

    // Update SKU if changed
    if (updatedOrder.sku && inventoryItem.sku !== updatedOrder.sku) {
      updates.sku = updatedOrder.sku;
    }

    // Update category/line if changed
    if (updatedOrder.category && updatedOrder.category !== '⚠️ NEEDS REVIEW') {
      updates.category = updatedOrder.category;
    }
    if (updatedOrder.line) {
      updates.line = updatedOrder.line;
    }
    
    // Update description if provided
    if (updatedOrder.description && !inventoryItem.description) {
      updates.description = updatedOrder.description;
    }

    // Remove warning flag if order is now complete
    if (inventoryItem.category.includes('⚠️ NEEDS REVIEW') && !updatedOrder.category.includes('⚠️ NEEDS REVIEW')) {
      updates.category = updatedOrder.category || '';
    }

    // Link this purchase order if not already linked
    if (!inventoryItem.linkedPurchaseOrders.includes(updatedOrder.id)) {
      updates.linkedPurchaseOrders = [...inventoryItem.linkedPurchaseOrders, updatedOrder.id];
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      updateInventoryItem(inventoryItem.id, updates);
    }
  } else if (updatedOrder.sku && updatedOrder.description) {
    // Create new inventory item if it doesn't exist
    // Only add stock if the order is verified
    const stockQuantity = updatedOrder.status === 'Verified' ? 
      (updatedOrder.quantityReceived || updatedOrder.quantity) : 0;
    
    addInventoryItem({
      name: updatedOrder.description,
      sku: updatedOrder.sku,
      supplierSKU: updatedOrder.supplierSKU,
      category: updatedOrder.category || '',
      line: updatedOrder.line || '',
      description: updatedOrder.description,
      images: updatedOrder.images || [],
      ecuadorStock: updatedOrder.destinationStock === 'Ecuador' ? stockQuantity : 0,
      usaStock: updatedOrder.destinationStock === 'USA' ? stockQuantity : 0,
      linkedPurchaseOrders: [updatedOrder.id],
    });
  }
}

export function syncInventoryToOrders(
  updatedItem: InventoryItem,
  purchaseOrders: PurchaseOrder[],
  updatePurchaseOrder: (id: string, order: Partial<PurchaseOrder>) => void
) {
  // Find all purchase orders linked to this inventory item
  const linkedOrders = purchaseOrders.filter(order => 
    updatedItem.linkedPurchaseOrders.includes(order.id) || order.sku === updatedItem.sku
  );

  linkedOrders.forEach(order => {
    const updates: Partial<PurchaseOrder> = {};

    // Update SKU if changed
    if (order.sku !== updatedItem.sku) {
      updates.sku = updatedItem.sku;
    }

    // Update category/line if changed and not empty
    if (updatedItem.category && updatedItem.category !== '⚠️ NEEDS REVIEW' && order.category !== updatedItem.category) {
      updates.category = updatedItem.category;
    }
    if (updatedItem.line && order.line !== updatedItem.line) {
      updates.line = updatedItem.line;
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      updatePurchaseOrder(order.id, updates);
    }
  });
}

export function cleanupInventoryAfterOrderDeletion(
  deletedOrderIds: string[],
  inventory: InventoryItem[],
  deleteInventoryItem: (id: string) => void
) {
  // Find inventory items that are only linked to the deleted orders
  inventory.forEach(item => {
    const remainingLinkedOrders = item.linkedPurchaseOrders.filter(
      orderId => !deletedOrderIds.includes(orderId)
    );
    
    // If no remaining linked orders, delete the inventory item
    if (remainingLinkedOrders.length === 0 && item.linkedPurchaseOrders.length > 0) {
      console.log('Deleting orphaned inventory item:', item.sku, item.name);
      deleteInventoryItem(item.id);
    }
  });
}
