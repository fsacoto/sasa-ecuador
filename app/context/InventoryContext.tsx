'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { Supplier, PurchaseOrder, InventoryItem, AdditionalCost, LandedCostCalculation } from '../types';
import { calculateLandedCostsForInvoice } from '../utils/landedCostCalculation';
import * as suppliersService from '../services/suppliersService';
import * as purchaseOrdersService from '../services/purchaseOrdersService';
import * as inventoryService from '../services/inventoryService';
import * as additionalCostsService from '../services/additionalCostsService';

interface InventoryContextType {
  // Suppliers
  suppliers: Supplier[];
  isLoading: boolean;
  addSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt'>) => Promise<string>;
  updateSupplier: (id: string, supplier: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  
  // Purchase Orders
  purchaseOrders: PurchaseOrder[];
  addPurchaseOrder: (order: Omit<PurchaseOrder, 'id' | 'createdAt'>) => Promise<string>;
  addPurchaseOrdersBulk: (orders: Omit<PurchaseOrder, 'id' | 'createdAt'>[]) => Promise<PurchaseOrder[]>;
  updatePurchaseOrder: (id: string, order: Partial<PurchaseOrder>) => Promise<void>;
  updatePurchaseOrdersBulk: (
    updates: Array<{ id: string; orderUpdate: Partial<PurchaseOrder> }>
  ) => Promise<void>;
  deletePurchaseOrder: (id: string) => Promise<void>;
  deletePurchaseOrdersBulk: (ids: string[]) => Promise<void>;
  
  // Inventory
  inventory: InventoryItem[];
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'createdAt'>) => Promise<string>;
  addInventoryItemsBulk: (items: Omit<InventoryItem, 'id' | 'createdAt'>[]) => Promise<void>;
  updateInventoryItem: (id: string, item: Partial<InventoryItem>) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;
  
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
  const { user, isLoading: authLoading } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [additionalCosts, setAdditionalCosts] = useState<AdditionalCost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadAllData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [suppliersData, ordersData, inventoryData, costsData] = await Promise.allSettled([
        suppliersService.getSuppliers(),
        purchaseOrdersService.getPurchaseOrders(),
        inventoryService.getInventoryItems(),
        additionalCostsService.getAdditionalCosts()
      ]);
      
      setSuppliers(suppliersData.status === 'fulfilled' ? suppliersData.value : []);
      setPurchaseOrders(ordersData.status === 'fulfilled' ? ordersData.value : []);
      setInventory(inventoryData.status === 'fulfilled' ? inventoryData.value : []);
      setAdditionalCosts(costsData.status === 'fulfilled' ? costsData.value : []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setSuppliers([]);
      setPurchaseOrders([]);
      setInventory([]);
      setAdditionalCosts([]);
      setIsLoading(false);
      return;
    }
    void loadAllData();
  }, [user?.id, authLoading, loadAllData]);

  // Supplier operations
  const addSupplier = async (supplier: Omit<Supplier, 'id' | 'createdAt'>): Promise<string> => {
    try {
      const newId = await suppliersService.addSupplier(supplier);
      const newSupplier: Supplier = {
        ...supplier,
        id: newId,
        createdAt: new Date(),
      };
      setSuppliers((prev) => [...prev, newSupplier]);
      return newId;
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
  const addPurchaseOrder = async (order: Omit<PurchaseOrder, 'id' | 'createdAt'>): Promise<string> => {
    try {
      const newId = await purchaseOrdersService.addPurchaseOrder(order);
      const newOrder: PurchaseOrder = {
        ...order,
        id: newId,
        createdAt: new Date(),
      };
      setPurchaseOrders(prev => [...prev, newOrder]);
      return newId;
    } catch (error) {
      console.error('Error adding purchase order:', error);
      throw error;
    }
  };

  // Bulk add multiple purchase orders
  const addPurchaseOrdersBulk = async (orders: Omit<PurchaseOrder, 'id' | 'createdAt'>[]): Promise<PurchaseOrder[]> => {
    try {
      const newIds = await purchaseOrdersService.addPurchaseOrdersBulk(orders);
      const newOrders: PurchaseOrder[] = orders.map((order, index) => ({
        ...order,
        id: newIds[index],
        createdAt: new Date(),
      }));
      setPurchaseOrders((prev) => [...prev, ...newOrders]);
      return newOrders;
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

  const updatePurchaseOrdersBulk = async (
    updates: Array<{ id: string; orderUpdate: Partial<PurchaseOrder> }>
  ) => {
    const unique = updates.filter((entry) => entry.id && Object.keys(entry.orderUpdate).length > 0);
    if (unique.length === 0) return;
    try {
      await purchaseOrdersService.updatePurchaseOrdersBulk(unique);
      const patchById = new Map(unique.map((entry) => [entry.id, entry.orderUpdate]));
      setPurchaseOrders((prev) =>
        prev.map((order) => {
          const patch = patchById.get(order.id);
          return patch ? { ...order, ...patch } : order;
        })
      );
    } catch (error) {
      console.error('Error updating purchase orders in bulk:', error);
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

  const deletePurchaseOrdersBulk = async (ids: string[]) => {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return;
    try {
      await purchaseOrdersService.deletePurchaseOrdersBulk(uniqueIds);
      const idSet = new Set(uniqueIds);
      setPurchaseOrders((prev) => prev.filter((o) => !idSet.has(o.id)));
    } catch (error) {
      console.error('Error deleting purchase orders in bulk:', error);
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

  const calculateLandedCosts = (invoiceNumber: string): LandedCostCalculation | null =>
    calculateLandedCostsForInvoice(invoiceNumber, purchaseOrders, additionalCosts);

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
        updatePurchaseOrdersBulk,
        deletePurchaseOrder,
        deletePurchaseOrdersBulk,
        inventory,
        addInventoryItem,
        addInventoryItemsBulk,
        updateInventoryItem,
        deleteInventoryItem,
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
