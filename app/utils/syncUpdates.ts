// Smart update functions to keep Purchase Orders and Inventory in sync

import { PurchaseOrder, InventoryItem } from '../types';

export function syncPurchaseOrderToInventory(
  updatedOrder: PurchaseOrder,
  inventory: InventoryItem[],
  updateInventoryItem: (id: string, item: Partial<InventoryItem>) => void,
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'createdAt'>) => void,
  deleteInventoryItem: (id: string) => void,
  purchaseOrders: PurchaseOrder[],
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
      item.linkedPurchaseOrders && item.linkedPurchaseOrders.includes(updatedOrder.id)
    );
  }

  // ACTION: If order is NOT verified, remove it from inventory completely
  if (updatedOrder.status !== 'Verified') {
    if (inventoryItem) {
      // Remove this purchase order from linked orders
      const linkedOrders = inventoryItem.linkedPurchaseOrders || [];
      const updatedLinkedOrders = linkedOrders.filter(
        orderId => orderId !== updatedOrder.id
      );
      
      // Remove stock that was added by this order
      const stockQuantity = updatedOrder.quantityReceived || updatedOrder.quantity;
      const updates: Partial<InventoryItem> = {
        linkedPurchaseOrders: updatedLinkedOrders,
      };
      
      if (updatedOrder.destinationStock === 'Ecuador') {
        updates.ecuadorStock = Math.max(0, (inventoryItem.ecuadorStock || 0) - stockQuantity);
      } else if (updatedOrder.destinationStock === 'USA') {
        updates.usaStock = Math.max(0, (inventoryItem.usaStock || 0) - stockQuantity);
      }
      
      // Check if item has other verified purchase orders
      const hasOtherVerifiedOrders = updatedLinkedOrders.some(orderId => {
        const otherOrder = purchaseOrders.find(o => o.id === orderId);
        return otherOrder && otherOrder.status === 'Verified';
      });
      
      // If item was originally created from purchase orders (has linked orders)
      // AND no other verified orders remain, delete it completely
      if (linkedOrders.length > 0 && !hasOtherVerifiedOrders) {
        // Item was only created from purchase orders and none are verified anymore - DELETE IT
        deleteInventoryItem(inventoryItem.id);
      } else {
        // Either:
        // 1. Item is standalone (no linked orders originally) - just remove stock/link
        // 2. Item has other verified orders - just remove this order's stock/link
        updateInventoryItem(inventoryItem.id, updates);
      }
    }
    // If order is not verified, don't create or update inventory - EXIT
    return;
  }

  // ORDER IS VERIFIED - Create or update inventory item
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
    const linkedOrders = inventoryItem.linkedPurchaseOrders || [];
    if (!linkedOrders.includes(updatedOrder.id)) {
      updates.linkedPurchaseOrders = [...linkedOrders, updatedOrder.id];
    }

    // Update stock when order is verified
    // Check if this order was already processed (to avoid double-counting)
    const wasAlreadyLinked = linkedOrders.includes(updatedOrder.id);
    if (!wasAlreadyLinked) {
      // Use quantityGood if available (items in good condition), otherwise fall back to quantityReceived or quantity
      const stockQuantity = updatedOrder.quantityGood !== undefined ? updatedOrder.quantityGood : (updatedOrder.quantityReceived || updatedOrder.quantity);
      if (updatedOrder.destinationStock === 'Ecuador') {
        updates.ecuadorStock = (inventoryItem.ecuadorStock || 0) + stockQuantity;
      } else if (updatedOrder.destinationStock === 'USA') {
        updates.usaStock = (inventoryItem.usaStock || 0) + stockQuantity;
      }
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      updateInventoryItem(inventoryItem.id, updates);
    }
  } else if (updatedOrder.sku && updatedOrder.description) {
    // Create new inventory item ONLY when order is verified
    // Use quantityGood if available (items in good condition), otherwise fall back to quantityReceived or quantity
    const stockQuantity = updatedOrder.quantityGood !== undefined ? updatedOrder.quantityGood : (updatedOrder.quantityReceived || updatedOrder.quantity);
    
    // Only create inventory item if there are good items to add
    if (stockQuantity > 0) {
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
}

export function syncInventoryToOrders(
  updatedItem: InventoryItem,
  purchaseOrders: PurchaseOrder[],
  updatePurchaseOrder: (id: string, order: Partial<PurchaseOrder>) => void
) {
  // Find all purchase orders linked to this inventory item
  const linkedPurchaseOrderIds = updatedItem.linkedPurchaseOrders || [];
  const linkedOrders = purchaseOrders.filter(order => 
    linkedPurchaseOrderIds.includes(order.id) || order.sku === updatedItem.sku
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
    const linkedOrders = item.linkedPurchaseOrders || [];
    const remainingLinkedOrders = linkedOrders.filter(
      orderId => !deletedOrderIds.includes(orderId)
    );
    
    // If no remaining linked orders, delete the inventory item
    if (remainingLinkedOrders.length === 0 && linkedOrders.length > 0) {
      console.log('Deleting orphaned inventory item:', item.sku, item.name);
      deleteInventoryItem(item.id);
    }
  });
}
