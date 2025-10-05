// Type definitions for SASA Inventory Management

export interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  currency: string;
  notes: string;
  createdAt: Date;
}

export interface PurchaseOrder {
  id: string;
  invoice: string;
  invoiceLink: string;
  supplierId: string;
  supplierSKU: string;
  description: string;
  sku: string;
  category: string;
  line: string;
  image: string;
  quantity: number;
  destinationStock: 'Ecuador' | 'USA';
  currency: string;
  costPerUnit: number;
  totalCost: number;
  discountPerUnit: number;
  totalDiscount: number;
  costPerUnitWithDiscount: number;
  totalCostWithDiscount: number;
  exchangeRate: number;
  costInUSD: number;
  shippingCost: number;
  tariffCost: number;
  otherFees: number;
  totalLandedCost: number;
  landedCostPerUnit: number;
  purchaseDate: Date;
  createdAt: Date;
}

export interface InventoryItem {
  id: string;
  name: string;
  supplierSKU: string;
  linkedPurchaseOrders: string[]; // IDs of purchase orders
  sku: string;
  description: string;
  category: string;
  line: string;
  ecuadorStock: number;
  usaStock: number;
  image: string;
  createdAt: Date;
}
