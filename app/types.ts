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

export type PurchaseOrderStatus = 'Ordered' | 'Shipped' | 'Received' | 'Verified';

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
  images: string[]; // Array of image URLs or base64 data
  quantity: number;
  quantityReceived?: number; // Actual quantity received after verification
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
  status: PurchaseOrderStatus;
  receivedDate?: Date;
  verifiedDate?: Date;
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
  images: string[]; // Array of image URLs or base64 data
  barcode?: string; // Base64 encoded barcode image
  createdAt: Date;
}

export type AdditionalCostType = 'Shipping' | 'Insurance' | 'Duties' | 'Import Fees' | 'Other';

export interface AdditionalCost {
  id: string;
  invoiceNumber: string; // Links to PurchaseOrder.invoice
  type: AdditionalCostType;
  amount: number;
  description: string;
  date: Date;
  createdAt: Date;
}

export interface LandedCostCalculation {
  invoiceNumber: string;
  baseItemTotal: number; // Sum of all items in the invoice
  totalAdditionalCosts: number;
  totalLandedCost: number;
  items: {
    purchaseOrderId: string;
    sku: string;
    description: string;
    quantity: number;
    baseCostPerUnit: number;
    baseItemTotal: number;
    proportionalShare: number; // Percentage of total additional costs
    additionalCostAllocation: number; // Amount allocated to this item
    finalCostPerUnit: number; // Base cost + allocated additional cost per unit
    finalItemTotal: number; // Final total cost for this item
  }[];
}
