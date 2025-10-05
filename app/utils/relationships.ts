// Utility functions for navigating data relationships

import { Supplier, PurchaseOrder, InventoryItem } from '../types';

export class DataRelationships {
  // Get all purchase orders for a specific supplier
  static getPurchaseOrdersBySupplier(
    supplierId: string,
    purchaseOrders: PurchaseOrder[]
  ): PurchaseOrder[] {
    return purchaseOrders.filter(order => order.supplierId === supplierId);
  }

  // Get all inventory items linked to a supplier (through purchase orders)
  static getInventoryItemsBySupplier(
    supplierId: string,
    inventory: InventoryItem[],
    purchaseOrders: PurchaseOrder[]
  ): InventoryItem[] {
    const supplierOrderIds = this.getPurchaseOrdersBySupplier(supplierId, purchaseOrders)
      .map(order => order.id);
    
    return inventory.filter(item =>
      item.linkedPurchaseOrders.some(orderId => supplierOrderIds.includes(orderId))
    );
  }

  // Get supplier for a purchase order
  static getSupplierForOrder(
    orderId: string,
    purchaseOrders: PurchaseOrder[],
    suppliers: Supplier[]
  ): Supplier | undefined {
    const order = purchaseOrders.find(o => o.id === orderId);
    if (!order) return undefined;
    return suppliers.find(s => s.id === order.supplierId);
  }

  // Get all purchase orders for an inventory item
  static getPurchaseOrdersForItem(
    itemId: string,
    inventory: InventoryItem[],
    purchaseOrders: PurchaseOrder[]
  ): PurchaseOrder[] {
    const item = inventory.find(i => i.id === itemId);
    if (!item) return [];
    return purchaseOrders.filter(order => item.linkedPurchaseOrders.includes(order.id));
  }

  // Get all suppliers for an inventory item (through purchase orders)
  static getSuppliersForItem(
    itemId: string,
    inventory: InventoryItem[],
    purchaseOrders: PurchaseOrder[],
    suppliers: Supplier[]
  ): Supplier[] {
    const orders = this.getPurchaseOrdersForItem(itemId, inventory, purchaseOrders);
    const supplierIds = [...new Set(orders.map(order => order.supplierId))];
    return suppliers.filter(supplier => supplierIds.includes(supplier.id));
  }

  // Get unique categories from purchase orders
  static getAllCategories(purchaseOrders: PurchaseOrder[]): string[] {
    const categories = purchaseOrders
      .map(order => order.category)
      .filter(cat => cat && cat.trim() !== '');
    return [...new Set(categories)].sort();
  }

  // Get unique product lines from purchase orders
  static getAllLines(purchaseOrders: PurchaseOrder[]): string[] {
    const lines = purchaseOrders
      .map(order => order.line)
      .filter(line => line && line.trim() !== '');
    return [...new Set(lines)].sort();
  }

  // Get inventory items by category
  static getInventoryByCategory(
    category: string,
    inventory: InventoryItem[]
  ): InventoryItem[] {
    return inventory.filter(item => 
      item.category.toLowerCase() === category.toLowerCase()
    );
  }

  // Get inventory items by line
  static getInventoryByLine(
    line: string,
    inventory: InventoryItem[]
  ): InventoryItem[] {
    return inventory.filter(item => 
      item.line.toLowerCase() === line.toLowerCase()
    );
  }

  // Calculate total value of inventory for a supplier
  static getSupplierInventoryValue(
    supplierId: string,
    inventory: InventoryItem[],
    purchaseOrders: PurchaseOrder[]
  ): number {
    const items = this.getInventoryItemsBySupplier(supplierId, inventory, purchaseOrders);
    let total = 0;

    items.forEach(item => {
      const linkedOrders = this.getPurchaseOrdersForItem(item.id, inventory, purchaseOrders);
      if (linkedOrders.length > 0) {
        const avgCost = linkedOrders.reduce((sum, order) => sum + order.costInUSD, 0) / linkedOrders.length;
        total += avgCost * (item.ecuadorStock + item.usaStock);
      }
    });

    return total;
  }

  // Get statistics for a supplier
  static getSupplierStats(
    supplierId: string,
    inventory: InventoryItem[],
    purchaseOrders: PurchaseOrder[]
  ) {
    const orders = this.getPurchaseOrdersBySupplier(supplierId, purchaseOrders);
    const items = this.getInventoryItemsBySupplier(supplierId, inventory, purchaseOrders);
    const totalSpent = orders.reduce((sum, order) => sum + order.costInUSD, 0);
    const totalStock = items.reduce((sum, item) => sum + item.ecuadorStock + item.usaStock, 0);

    return {
      orderCount: orders.length,
      itemCount: items.length,
      totalSpent,
      inventoryValue: this.getSupplierInventoryValue(supplierId, inventory, purchaseOrders),
      totalStock,
    };
  }
}
