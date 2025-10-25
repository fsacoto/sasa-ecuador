'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Supplier, PurchaseOrder, InventoryItem, AdditionalCost, LandedCostCalculation } from '../types';

interface InventoryContextType {
  // Suppliers
  suppliers: Supplier[];
  addSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt'>) => void;
  updateSupplier: (id: string, supplier: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;
  
  // Purchase Orders
  purchaseOrders: PurchaseOrder[];
  addPurchaseOrder: (order: Omit<PurchaseOrder, 'id' | 'createdAt'>) => void;
  addPurchaseOrdersBulk: (orders: Omit<PurchaseOrder, 'id' | 'createdAt'>[]) => void;
  updatePurchaseOrder: (id: string, order: Partial<PurchaseOrder>) => void;
  deletePurchaseOrder: (id: string) => void;
  
  // Inventory
  inventory: InventoryItem[];
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'createdAt'>) => void;
  addInventoryItemsBulk: (items: Omit<InventoryItem, 'id' | 'createdAt'>[]) => void;
  updateInventoryItem: (id: string, item: Partial<InventoryItem>) => void;
  deleteInventoryItem: (id: string) => void;
  
  // Additional Costs
  additionalCosts: AdditionalCost[];
  addAdditionalCost: (cost: Omit<AdditionalCost, 'id' | 'createdAt'>) => void;
  updateAdditionalCost: (id: string, cost: Partial<AdditionalCost>) => void;
  deleteAdditionalCost: (id: string) => void;
  getAdditionalCostsByInvoice: (invoiceNumber: string) => AdditionalCost[];
  calculateLandedCosts: (invoiceNumber: string) => LandedCostCalculation | null;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [additionalCosts, setAdditionalCosts] = useState<AdditionalCost[]>([]);

  // Supplier operations
  const addSupplier = (supplier: Omit<Supplier, 'id' | 'createdAt'>) => {
    const newSupplier: Supplier = {
      ...supplier,
      id: Date.now().toString(),
      createdAt: new Date(),
    };
    setSuppliers([...suppliers, newSupplier]);
  };

  const updateSupplier = (id: string, supplierUpdate: Partial<Supplier>) => {
    setSuppliers(suppliers.map(s => s.id === id ? { ...s, ...supplierUpdate } : s));
  };

  const deleteSupplier = (id: string) => {
    setSuppliers(prev => prev.filter(s => s.id !== id));
  };

  // Purchase Order operations
  const addPurchaseOrder = (order: Omit<PurchaseOrder, 'id' | 'createdAt'>) => {
    const newOrder: PurchaseOrder = {
      ...order,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
    };
    setPurchaseOrders(prev => [...prev, newOrder]);
  };

  // Bulk add multiple purchase orders
  const addPurchaseOrdersBulk = (orders: Omit<PurchaseOrder, 'id' | 'createdAt'>[]) => {
    const newOrders: PurchaseOrder[] = orders.map((order, index) => ({
      ...order,
      id: `${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
    }));
    setPurchaseOrders(prev => [...prev, ...newOrders]);
  };

  const updatePurchaseOrder = (id: string, orderUpdate: Partial<PurchaseOrder>) => {
    setPurchaseOrders(prev => prev.map(o => o.id === id ? { ...o, ...orderUpdate } : o));
  };

  const deletePurchaseOrder = (id: string) => {
    setPurchaseOrders(prev => prev.filter(o => o.id !== id));
  };

  // Inventory operations
  const addInventoryItem = (item: Omit<InventoryItem, 'id' | 'createdAt'>) => {
    const newItem: InventoryItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
    };
    setInventory(prev => [...prev, newItem]);
  };

  // Bulk add multiple inventory items
  const addInventoryItemsBulk = (items: Omit<InventoryItem, 'id' | 'createdAt'>[]) => {
    const newItems: InventoryItem[] = items.map((item, index) => ({
      ...item,
      id: `${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
    }));
    setInventory(prev => [...prev, ...newItems]);
  };

  const updateInventoryItem = (id: string, itemUpdate: Partial<InventoryItem>) => {
    setInventory(prev => prev.map(i => i.id === id ? { ...i, ...itemUpdate } : i));
  };

  const deleteInventoryItem = (id: string) => {
    setInventory(prev => prev.filter(i => i.id !== id));
  };

  // Additional Costs operations
  const addAdditionalCost = (cost: Omit<AdditionalCost, 'id' | 'createdAt'>) => {
    const newCost: AdditionalCost = {
      ...cost,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
    };
    setAdditionalCosts(prev => [...prev, newCost]);
  };

  const updateAdditionalCost = (id: string, costUpdate: Partial<AdditionalCost>) => {
    setAdditionalCosts(prev => prev.map(c => c.id === id ? { ...c, ...costUpdate } : c));
  };

  const deleteAdditionalCost = (id: string) => {
    setAdditionalCosts(prev => prev.filter(c => c.id !== id));
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
