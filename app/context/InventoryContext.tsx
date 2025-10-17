'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Supplier, PurchaseOrder, InventoryItem } from '../types';

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
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

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
