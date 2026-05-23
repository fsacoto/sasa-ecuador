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

export type PurchaseOrderStatus = 'Ordered' | 'Received' | 'Verified';

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
  /** Units registered via barcode scanner while Received (before full verification). */
  quantityScanned?: number;
  lastScannedAt?: Date;
  verificationComment?: string; // Comment about verification (problems, issues, etc.)
  verificationMedia?: string[]; // Array of media URLs (images, videos) attached to verification
  /** Pending supplier follow-up when units were not received (claim). */
  supplierClaimStatus?: 'none' | 'pending' | 'resolved';
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
  /** Label image URL (Firebase Storage): generated on the PO when there is SKU; reused from inventory or other OC lines with the same internal SKU; copied to inventory when verified. */
  barcode?: string;
  /** Shared id for all lines created in one bulk CSV import (used to edit/delete as a batch). */
  bulkImportId?: string;
  /** Display label for the bulk import (e.g. CSV filename). */
  bulkImportLabel?: string;
}

/** Problem qty from PO verification (damaged, etc.) — stock still counts units on hand. */
export interface VerificationIssueRef {
  purchaseOrderId: string;
  quantityProblem: number;
  /** Good qty from the same verification (for display: e.g. 2 good + 1 problem = 3 on hand). */
  quantityGoodAtVerification?: number;
  comment?: string;
  /** Evidence from PO verification (same URLs as PurchaseOrder.verificationMedia). */
  mediaUrls?: string[];
}

/** Units reported damaged/problem on consignment return — still on-hand physically (same as PO verification issues). */
export interface ConsignmentReturnIssueRef {
  consignmentFirestoreId: string;
  consignmentNumber: string;
  sku: string;
  /** Index in consignment.items when the same SKU appears on multiple lines. */
  itemIndex?: number;
  quantityProblem: number;
  /** Units returned in good condition in this batch (optional, for display). */
  quantityGoodInReturn?: number;
  comment?: string;
  /** Evidence photos; each URL belongs to this SKU line (see popup linking). */
  mediaUrls?: string[];
  recordedAt: Date;
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
  consignmentStock?: number; // Inventory on consignment
  images: string[]; // Array of image URLs or base64 data
  barcode?: string; // Base64 encoded barcode image
  /** Manual USD sale price for catalog and reference (optional). */
  salePrice?: number;
  /** Per linked PO: units flagged with problems at verification; click warning in Inventory to read comments. */
  verificationIssues?: VerificationIssueRef[];
  /** Returns from consignations with reported damage — shown alongside PO verification issues. */
  consignmentReturnIssues?: ConsignmentReturnIssueRef[];
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

export type ContentType = 'product' | 'collection' | 'general';
export type ContentStatus = 'draft' | 'submitted' | 'approved' | 'published' | 'archived' | 'rejected';
export type ContentLanguage = 'es';

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
  /** Parallel to `images` (same length): internal SKU each file was tied to at upload; empty string if none. For Storage browse, paths use `images/cms/by-sku/{sanitizedSku}/…`. */
  imageLinkedSkus?: string[];
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

/** Payload for creating new CMS rows; `createCMSDraft` sets status, statusHistory, and metadata. */
export type CMSContentDraftInput = Omit<CMSContent, 'id' | 'metadata' | 'status' | 'statusHistory'>;

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
  /** Set when the nota de venta is created from consignment sales registration. */
  sourceConsignmentId?: string;
  sourceConsignmentFirestoreId?: string;
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
