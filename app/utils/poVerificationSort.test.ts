/**
 * Lightweight assertions — run: npx tsx app/utils/poVerificationSort.test.ts
 */
import type { PurchaseOrder } from '../types';
import { sortPurchaseOrdersForVerification, sortItemsByPurchaseOrderList } from './poVerificationSort';

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
    category: 'Pulseras',
    line: 'Baño de oro',
    images: [],
    quantity: 1,
    currency: 'USD',
    costPerUnit: 1,
    totalCost: 1,
    discountPerUnit: 0,
    totalDiscount: 0,
    costPerUnitWithDiscount: 1,
    totalCostWithDiscount: 1,
    exchangeRate: 1,
    costInUSD: 1,
    shippingCost: 0,
    tariffCost: 0,
    otherFees: 0,
    totalLandedCost: 1,
    landedCostPerUnit: 1,
    purchaseDate: new Date('2026-01-01'),
    status: 'Ordered',
    createdAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

const excelFirst = baseOrder({
  id: 'a',
  description: 'Excel 1',
  category: 'Anillos',
  line: 'Plata',
  bulkImportRowIndex: 0,
  createdAt: new Date('2026-01-03T00:00:00Z'),
});
const excelSecond = baseOrder({
  id: 'b',
  description: 'Excel 2',
  category: 'Pulseras',
  line: 'Baño de oro',
  bulkImportRowIndex: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
});
const excelThird = baseOrder({
  id: 'c',
  description: 'Excel 3',
  category: 'Anillos',
  line: 'Baño de oro',
  bulkImportRowIndex: 2,
  createdAt: new Date('2026-01-02T00:00:00Z'),
});

const shuffled = [excelSecond, excelThird, excelFirst];

const byExcel = sortPurchaseOrdersForVerification(shuffled, 'excel');
assert(
  byExcel.map((o) => o.id).join(',') === 'a,b,c',
  `excel order should follow bulkImportRowIndex, got ${byExcel.map((o) => o.id).join(',')}`
);

const byCategory = sortPurchaseOrdersForVerification(shuffled, 'category');
assert(
  byCategory.map((o) => o.id).join(',') === 'c,a,b',
  `category then line, got ${byCategory.map((o) => o.id).join(',')}`
);

const byLine = sortPurchaseOrdersForVerification(shuffled, 'line');
assert(
  byLine.map((o) => o.id).join(',') === 'c,b,a',
  `line then category, got ${byLine.map((o) => o.id).join(',')}`
);

const withoutIndex = [
  baseOrder({ id: 'late', createdAt: new Date('2026-02-01') }),
  baseOrder({ id: 'early', createdAt: new Date('2026-01-01') }),
];
const byCreated = sortPurchaseOrdersForVerification(withoutIndex, 'excel');
assert(byCreated[0].id === 'early', 'excel fallback should use createdAt');

const wrapped = sortItemsByPurchaseOrderList(
  shuffled.map((order) => ({ order, tag: order.id })),
  'excel'
);
assert(
  wrapped.map((w) => w.tag).join(',') === 'a,b,c',
  `row wrapper should follow excel order, got ${wrapped.map((w) => w.tag).join(',')}`
);

console.log('poVerificationSort.test.ts: all passed');
