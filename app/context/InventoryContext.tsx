'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Supplier, PurchaseOrder, InventoryItem, InventoryCountry, InventoryTransfer, AdditionalCost, LandedCostCalculation } from '../types';
import * as suppliersService from '../services/suppliersService';
import * as purchaseOrdersService from '../services/purchaseOrdersService';
import * as inventoryService from '../services/inventoryService';
import * as additionalCostsService from '../services/additionalCostsService';

interface InventoryContextType {
  // Suppliers
  suppliers: Supplier[];
  isLoading: boolean;
  addSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt'>) => Promise<void>;
  updateSupplier: (id: string, supplier: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  
  // Purchase Orders
  purchaseOrders: PurchaseOrder[];
  addPurchaseOrder: (order: Omit<PurchaseOrder, 'id' | 'createdAt'>) => Promise<void>;
  addPurchaseOrdersBulk: (orders: Omit<PurchaseOrder, 'id' | 'createdAt'>[]) => Promise<void>;
  updatePurchaseOrder: (id: string, order: Partial<PurchaseOrder>) => Promise<void>;
  deletePurchaseOrder: (id: string) => Promise<void>;
  
  // Inventory
  inventory: InventoryItem[];
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'createdAt'>) => Promise<string>;
  addInventoryItemsBulk: (items: Omit<InventoryItem, 'id' | 'createdAt'>[]) => Promise<void>;
  updateInventoryItem: (id: string, item: Partial<InventoryItem>) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;
  moveInventoryBetweenCountries: (params: {
    items: Array<{
      itemId: string;
      fromCountry: InventoryCountry;
      toCountry: InventoryCountry;
      quantity: number;
    }>;
    note?: string;
    movedBy?: { uid: string; name?: string };
  }) => Promise<void>;
  inventoryTransfers: InventoryTransfer[];
  isTransfersLoading: boolean;
  loadInventoryTransfers: (options?: { itemId?: string; limitCount?: number }) => Promise<void>;
  
  // Additional Costs
  additionalCosts: AdditionalCost[];
  addAdditionalCost: (cost: Omit<AdditionalCost, 'id' | 'createdAt'>) => Promise<void>;
  updateAdditionalCost: (id: string, cost: Partial<AdditionalCost>) => Promise<void>;
  deleteAdditionalCost: (id: string) => Promise<void>;
  getAdditionalCostsByInvoice: (invoiceNumber: string) => AdditionalCost[];
  calculateLandedCosts: (invoiceNumber: string) => LandedCostCalculation | null;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryTransfers, setInventoryTransfers] = useState<InventoryTransfer[]>([]);
  const [isTransfersLoading, setIsTransfersLoading] = useState(false);
  const [additionalCosts, setAdditionalCosts] = useState<AdditionalCost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load all data on mount
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setIsLoading(true);
      const [suppliersData, ordersData, inventoryData, transfersData, costsData] = await Promise.allSettled([
        suppliersService.getSuppliers(),
        purchaseOrdersService.getPurchaseOrders(),
        inventoryService.getInventoryItems(),
        inventoryService.getInventoryTransfers({ limitCount: 200 }).catch(() => []), // Gracefully handle permission errors
        additionalCostsService.getAdditionalCosts()
      ]);
      
      setSuppliers(suppliersData.status === 'fulfilled' ? suppliersData.value : []);
      setPurchaseOrders(ordersData.status === 'fulfilled' ? ordersData.value : []);
      setInventory(inventoryData.status === 'fulfilled' ? inventoryData.value : []);
      setInventoryTransfers(transfersData.status === 'fulfilled' ? transfersData.value : []);
      setAdditionalCosts(costsData.status === 'fulfilled' ? costsData.value : []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadInventoryTransfers = async (options?: { itemId?: string; limitCount?: number }) => {
    try {
      setIsTransfersLoading(true);
      const transfers = await inventoryService.getInventoryTransfers({
        itemId: options?.itemId,
        limitCount: options?.limitCount ?? 200
      });
      setInventoryTransfers(transfers);
    } catch (error) {
      console.error('Error loading inventory transfers:', error);
      throw error;
    } finally {
      setIsTransfersLoading(false);
    }
  };

  // Supplier operations
  const addSupplier = async (supplier: Omit<Supplier, 'id' | 'createdAt'>) => {
    try {
      const newId = await suppliersService.addSupplier(supplier);
      const newSupplier: Supplier = {
        ...supplier,
        id: newId,
        createdAt: new Date(),
      };
      setSuppliers([...suppliers, newSupplier]);
    } catch (error) {
      console.error('Error adding supplier:', error);
      throw error;
    }
  };

  const updateSupplier = async (id: string, supplierUpdate: Partial<Supplier>) => {
    try {
      await suppliersService.updateSupplier(id, supplierUpdate);
      setSuppliers(suppliers.map(s => s.id === id ? { ...s, ...supplierUpdate } : s));
    } catch (error) {
      console.error('Error updating supplier:', error);
      throw error;
    }
  };

  const deleteSupplier = async (id: string) => {
    try {
      await suppliersService.deleteSupplier(id);
      setSuppliers(prev => prev.filter(s => s.id !== id));
    } catch (error) {
      console.error('Error deleting supplier:', error);
      throw error;
    }
  };

  // Purchase Order operations
  const addPurchaseOrder = async (order: Omit<PurchaseOrder, 'id' | 'createdAt'>) => {
    try {
      const newId = await purchaseOrdersService.addPurchaseOrder(order);
      const newOrder: PurchaseOrder = {
        ...order,
        id: newId,
        createdAt: new Date(),
      };
      setPurchaseOrders(prev => [...prev, newOrder]);
    } catch (error) {
      console.error('Error adding purchase order:', error);
      throw error;
    }
  };

  // Bulk add multiple purchase orders
  const addPurchaseOrdersBulk = async (orders: Omit<PurchaseOrder, 'id' | 'createdAt'>[]) => {
    try {
      const newIds = await purchaseOrdersService.addPurchaseOrdersBulk(orders);
      const newOrders: PurchaseOrder[] = orders.map((order, index) => ({
        ...order,
        id: newIds[index],
        createdAt: new Date(),
      }));
      setPurchaseOrders(prev => [...prev, ...newOrders]);
    } catch (error) {
      console.error('Error adding purchase orders in bulk:', error);
      throw error;
    }
  };

  const updatePurchaseOrder = async (id: string, orderUpdate: Partial<PurchaseOrder>) => {
    try {
      await purchaseOrdersService.updatePurchaseOrder(id, orderUpdate);
      setPurchaseOrders(prev => prev.map(o => o.id === id ? { ...o, ...orderUpdate } : o));
    } catch (error) {
      console.error('Error updating purchase order:', error);
      throw error;
    }
  };

  const deletePurchaseOrder = async (id: string) => {
    try {
      await purchaseOrdersService.deletePurchaseOrder(id);
      setPurchaseOrders(prev => prev.filter(o => o.id !== id));
    } catch (error) {
      console.error('Error deleting purchase order:', error);
      throw error;
    }
  };

  // Inventory operations
  const addInventoryItem = async (item: Omit<InventoryItem, 'id' | 'createdAt'>): Promise<string> => {
    try {
      const newId = await inventoryService.addInventoryItem(item);
      const newItem: InventoryItem = {
        ...item,
        id: newId,
        createdAt: new Date(),
      };
      setInventory(prev => [...prev, newItem]);
      return newId;
    } catch (error) {
      console.error('Error adding inventory item:', error);
      throw error;
    }
  };

  // Bulk add multiple inventory items
  const addInventoryItemsBulk = async (items: Omit<InventoryItem, 'id' | 'createdAt'>[]) => {
    try {
      const newIds = await inventoryService.addInventoryItemsBulk(items);
      const newItems: InventoryItem[] = items.map((item, index) => ({
        ...item,
        id: newIds[index],
        createdAt: new Date(),
      }));
      setInventory(prev => [...prev, ...newItems]);
    } catch (error) {
      console.error('Error adding inventory items in bulk:', error);
      throw error;
    }
  };

  const updateInventoryItem = async (id: string, itemUpdate: Partial<InventoryItem>) => {
    try {
      await inventoryService.updateInventoryItem(id, itemUpdate);
      setInventory(prev => prev.map(i => i.id === id ? { ...i, ...itemUpdate } : i));
    } catch (error) {
      console.error('Error updating inventory item:', error);
      throw error;
    }
  };

  const deleteInventoryItem = async (id: string) => {
    try {
      await inventoryService.deleteInventoryItem(id);
      setInventory(prev => prev.filter(i => i.id !== id));
    } catch (error) {
      console.error('Error deleting inventory item:', error);
      throw error;
    }
  };

  const moveInventoryBetweenCountries = async (params: {
    items: Array<{
      itemId: string;
      fromCountry: InventoryCountry;
      toCountry: InventoryCountry;
      quantity: number;
    }>;
    note?: string;
    movedBy?: { uid: string; name?: string };
  }) => {
    try {
      const result = await inventoryService.moveInventoryBetweenCountries(params);
      
      // Update inventory for all items in the transfer
      setInventory(prev => prev.map(i => {
        const transferItem = result.items.find(ti => ti.itemId === i.id);
        if (transferItem) {
          return {
            ...i,
            ecuadorStock: transferItem.resultingEcuadorStock ?? i.ecuadorStock,
            usaStock: transferItem.resultingUsaStock ?? i.usaStock
          };
        }
        return i;
      }));
      
      setInventoryTransfers(prev => {
        const next = [result, ...prev];
        next.sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
        return next;
      });
    } catch (error) {
      console.error('Error moving inventory between countries:', error);
      throw error;
    }
  };

  // Additional Costs operations
  const addAdditionalCost = async (cost: Omit<AdditionalCost, 'id' | 'createdAt'>) => {
    try {
      const newId = await additionalCostsService.addAdditionalCost(cost);
      const newCost: AdditionalCost = {
        ...cost,
        id: newId,
        createdAt: new Date(),
      };
      setAdditionalCosts(prev => [...prev, newCost]);
    } catch (error) {
      console.error('Error adding additional cost:', error);
      throw error;
    }
  };

  const updateAdditionalCost = async (id: string, costUpdate: Partial<AdditionalCost>) => {
    try {
      await additionalCostsService.updateAdditionalCost(id, costUpdate);
      setAdditionalCosts(prev => prev.map(c => c.id === id ? { ...c, ...costUpdate } : c));
    } catch (error) {
      console.error('Error updating additional cost:', error);
      throw error;
    }
  };

  const deleteAdditionalCost = async (id: string) => {
    try {
      await additionalCostsService.deleteAdditionalCost(id);
      setAdditionalCosts(prev => prev.filter(c => c.id !== id));
    } catch (error) {
      console.error('Error deleting additional cost:', error);
      throw error;
    }
  };

  const getAdditionalCostsByInvoice = (invoiceNumber: string) => {
    return additionalCosts.filter(cost => cost.invoiceNumber === invoiceNumber);
  };

  const calculateLandedCosts = (invoiceNumber: string): LandedCostCalculation | null => {
    // Get all purchase orders for this invoice
    const invoiceOrders = purchaseOrders.filter(order => order.invoice === invoiceNumber);
    if (invoiceOrders.length === 0) return null;

    // Get all additional costs for this invoice
    const costs = getAdditionalCostsByInvoice(invoiceNumber);
    const totalAdditionalCosts = costs.reduce((sum, cost) => sum + cost.amount, 0);

    // Calculate base item total (sum of all item totals)
    const baseItemTotal = invoiceOrders.reduce((sum, order) => sum + order.costInUSD, 0);

    // Calculate proportional allocation for each item
    const items = invoiceOrders.map(order => {
      const proportionalShare = baseItemTotal > 0 ? (order.costInUSD / baseItemTotal) : 0;
      const additionalCostAllocation = totalAdditionalCosts * proportionalShare;
      const finalCostPerUnit = order.costInUSD / order.quantity + (additionalCostAllocation / order.quantity);
      const finalItemTotal = order.costInUSD + additionalCostAllocation;

      return {
        purchaseOrderId: order.id,
        sku: order.sku,
        description: order.description,
        quantity: order.quantity,
        baseCostPerUnit: order.costInUSD / order.quantity,
        baseItemTotal: order.costInUSD,
        proportionalShare: proportionalShare * 100, // Convert to percentage
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
  };

  return (
    <InventoryContext.Provider
      value={{
        suppliers,
        isLoading,
        addSupplier,
        updateSupplier,
        deleteSupplier,
        purchaseOrders,
        addPurchaseOrder,
        addPurchaseOrdersBulk,
        updatePurchaseOrder,
        deletePurchaseOrder,
        inventory,
        addInventoryItem,
        addInventoryItemsBulk,
        updateInventoryItem,
        deleteInventoryItem,
        moveInventoryBetweenCountries,
        inventoryTransfers,
        isTransfersLoading,
        loadInventoryTransfers,
        additionalCosts,
        addAdditionalCost,
        updateAdditionalCost,
        deleteAdditionalCost,
        getAdditionalCostsByInvoice,
        calculateLandedCosts,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
}
