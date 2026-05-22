/**
 * Lightweight assertions — run: npx tsx app/utils/purchaseOrderBarcodeScan.test.ts
 */
import type { PurchaseOrder } from '../types';
import {
  findPurchaseOrderLinesByBarcodeScan,
  getScanProgress,
  getQuantityScanned,
  shouldShowScanStatus,
  scanProgressClearUpdate,
  isLinePendingScanner,
  listInvoicesEligibleForScanner,
} from './purchaseOrderBarcodeScan';
import { getUPCAFromSKU } from './barcodeGenerator';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function baseOrder(overrides: Partial<PurchaseOrder>): PurchaseOrder {
  return {
    id: '1',
    invoice: 'INV-100',
    invoiceLink: '',
    supplierId: 'sup1',
    supplierSKU: 'SUP-ABC',
    description: 'Ring',
    sku: 'PUBO0001',
    category: 'PU',
    line: 'BO',
    images: [],
    quantity: 6,
    currency: 'USD',
    costPerUnit: 10,
    totalCost: 60,
    discountPerUnit: 0,
    totalDiscount: 0,
    costPerUnitWithDiscount: 10,
    totalCostWithDiscount: 60,
    exchangeRate: 1,
    costInUSD: 60,
    shippingCost: 0,
    tariffCost: 0,
    otherFees: 0,
    totalLandedCost: 60,
    landedCostPerUnit: 10,
    purchaseDate: new Date(),
    status: 'Received',
    createdAt: new Date(),
    ...overrides,
  };
}

const lineA = baseOrder({ id: 'a', description: 'Line A' });
const lineB = baseOrder({ id: 'b', description: 'Line B', supplierSKU: 'SUP-XYZ' });
const lineSameSku = baseOrder({ id: 'c', description: 'Line C duplicate sku' });

// Internal SKU match
let matches = findPurchaseOrderLinesByBarcodeScan([lineA], 'PUBO0001', { invoice: 'INV-100' });
assert(matches.length === 1 && matches[0].id === 'a', 'matches internal SKU');

// UPC fallback
const upc = getUPCAFromSKU('PUBO0001');
matches = findPurchaseOrderLinesByBarcodeScan([lineA], upc, { invoice: 'INV-100' });
assert(matches.length === 1, 'matches UPC payload');

// Supplier SKU
matches = findPurchaseOrderLinesByBarcodeScan([lineB], 'SUP-XYZ', { invoice: 'INV-100' });
assert(matches.length === 1 && matches[0].id === 'b', 'matches supplier SKU');

// Multiple lines same internal SKU
matches = findPurchaseOrderLinesByBarcodeScan([lineA, lineSameSku], 'PUBO0001', {
  invoice: 'INV-100',
});
assert(matches.length === 2, 'two lines same SKU');

// Received lines with full scan still match (confirmación manual después)
const complete = baseOrder({
  id: 'done',
  quantityScanned: 6,
  status: 'Received',
});
matches = findPurchaseOrderLinesByBarcodeScan([lineA, complete], 'PUBO0001', {
  invoice: 'INV-100',
});
assert(matches.length === 2, 'includes received lines awaiting confirm');

// Progress
const prog = getScanProgress(baseOrder({ quantity: 6, quantityScanned: 3 }));
assert(prog.scanned === 3 && prog.remaining === 3 && !prog.isComplete, 'partial progress');
assert(getScanProgress(baseOrder({ quantity: 6, quantityScanned: 6 })).isComplete, 'complete progress');
assert(getQuantityScanned({} as PurchaseOrder) === 0, 'missing scanned is 0');

// Verified not eligible
assert(!isLinePendingScanner(baseOrder({ status: 'Verified' })), 'verified not pending');
assert(!shouldShowScanStatus(baseOrder({ status: 'Verified', quantityScanned: 6 })), 'verified hides scan');
assert(!shouldShowScanStatus(baseOrder({ status: 'Received', quantityScanned: 0 })), 'no scan until started');
assert(shouldShowScanStatus(baseOrder({ status: 'Received', quantityScanned: 2 })), 'received with scans');
assert(scanProgressClearUpdate().quantityScanned === 0, 'clear update zeros scan');

// Invoice list
const invs = listInvoicesEligibleForScanner([lineA, baseOrder({ status: 'Verified', invoice: 'X' })]);
assert(invs.includes('INV-100'), 'lists invoice with pending lines');

console.log('purchaseOrderBarcodeScan.test.ts: all passed');
