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
  quantityGood?: number; // Quantity in good condition (goes to inventory)
  quantityProblem?: number; // Quantity with problems (damaged, needs repair, etc. - doesn't go to inventory)
  quantityNotReceived?: number; // Quantity never received
  verificationComment?: string; // Comment about verification (problems, issues, etc.)
  verificationMedia?: string[]; // Array of media URLs (images, videos) attached to verification
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
  consignmentStock?: number; // Inventory on consignment
  images: string[]; // Array of image URLs or base64 data
  barcode?: string; // Base64 encoded barcode image
  createdAt: Date;
}

export type InventoryCountry = 'Ecuador' | 'USA';

export interface InventoryTransferItem {
  itemId: string;
  sku: string;
  name: string;
  quantity: number;
  fromCountry: InventoryCountry;
  toCountry: InventoryCountry;
  resultingEcuadorStock?: number;
  resultingUsaStock?: number;
}

export interface InventoryTransfer {
  id: string;
  transactionId: string; // Unique identifier for the entire transaction
  items: InventoryTransferItem[]; // Multiple items in one transaction
  note?: string;
  createdAt: Date;
  createdBy?: {
    uid: string;
    name?: string;
  };
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

export type ContentType = 'product' | 'collection' | 'general';
export type ContentStatus = 'draft' | 'submitted' | 'approved' | 'published' | 'archived' | 'rejected';
export type ContentLanguage = 'en' | 'es';

export interface CMSContent {
  id: string;
  type: ContentType;
  title: string;
  description: string;
  hashtags: string[];
  status: ContentStatus;
  statusHistory: {
    status: ContentStatus | 'resubmitted';
    timestamp: Date;
    userId: string;
    notes?: string;
  }[];
  images: string[];
  videos: string[];
  authorId: string;
  authorName: string;
  category: string;
  tags: string[];
  language: ContentLanguage;
  linkedProductIds: string[]; // SKUs of linked inventory items
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    publishedAt?: Date;
    archivedAt?: Date;
    reviewerId?: string;
    reviewerNotes?: string;
    resubmissionCount?: number;
    lastResubmittedAt?: Date;
  };
}

export interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address: string;
  city: string;
  country: 'Ecuador' | 'USA';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesInvoiceLine {
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  line?: string;
  category?: string;
}

export interface PaymentRecord {
  date: Date;
  amount: number;
  method?: string;
  comment?: string;
}

export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  clientAddress: string;
  items: SalesInvoiceLine[];
  subtotal: number;
  discountType?: 'percentage' | 'flat';
  discountValue: number;
  discountTotal: number;
  grandTotal: number;
  date: Date;
  notes?: string;
  createdAt: Date;
  // New tracking fields
  salesAgent?: string;
  currency: 'USD' | 'Local';
  deliveryStatus: 'Pending' | 'Partially Delivered' | 'Delivered' | 'Canceled';
  deliveryDate?: Date;
  deliveryNotes?: string;
  paymentStatus: 'Unpaid' | 'Partially Paid' | 'Paid';
  amountPaid: number;
  remainingBalance: number;
  paymentDate?: Date;
  paymentMethod?: string;
  paymentComment?: string;
  paymentHistory?: PaymentRecord[];
}

export type ConsignmentStatus = 'Open' | 'Partially Closed' | 'Closed';

export interface ConsignmentItem {
  sku: string;
  description: string;
  quantityDelivered: number;
  quantitySold: number;
  quantityReturned: number;
  line?: string;
  category?: string;
}

export interface Consignment {
  id: string;
  consignmentId: string; // Format: CSG-00001
  clientId: string;
  clientName: string;
  clientAddress?: string;
  items: ConsignmentItem[];
  status: ConsignmentStatus;
  dateCreated: Date;
  createdAt: Date;
}

export interface InventoryMedia {
  id: string;
  sku: string;
  itemId?: string;
  itemName?: string;
  images: string[];
  createdAt: Date;
  updatedAt: Date;
}
