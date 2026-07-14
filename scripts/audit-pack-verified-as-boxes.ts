/**
 * Optional audit: Verified pack lines where good+problem ≈ ordered quantity
 * (likely verified counting boxes instead of saleable units).
 *
 * Run: npx tsx scripts/audit-pack-verified-as-boxes.ts
 *
 * Note: requires Firebase admin / app credentials configured for the project.
 * By default this only loads existing PO helpers and prints logic against an
 * in-memory snapshot you can paste or extend.
 */
import type { PurchaseOrder } from '../app/types';
import {
  expectedSaleableQuantity,
  isPackBased,
} from '../app/utils/purchaseOrderPack';

export type PackVerifyAuditRow = {
  id: string;
  invoice: string;
  sku: string;
  quantity: number;
  unitsPerPack: number;
  expectedSaleable: number;
  verifiedUnits: number;
  likelyCountedPacks: boolean;
};

export function auditPackVerifiedAsBoxes(orders: PurchaseOrder[]): PackVerifyAuditRow[] {
  const rows: PackVerifyAuditRow[] = [];

  for (const order of orders) {
    if (order.status !== 'Verified' || !isPackBased(order)) continue;
    const expectedSaleable = expectedSaleableQuantity(order);
    const verifiedUnits =
      (Number(order.quantityGood) || 0) + (Number(order.quantityProblem) || 0);
    const ordered = Math.max(0, Number(order.quantity) || 0);
    // Flag when verified ≈ pack count (and far from saleable)
    const nearPackCount = Math.abs(verifiedUnits - ordered) <= 0 && ordered > 0;
    const farFromSaleable = Math.abs(verifiedUnits - expectedSaleable) > 0;
    if (nearPackCount && farFromSaleable) {
      rows.push({
        id: order.id,
        invoice: order.invoice,
        sku: order.sku,
        quantity: ordered,
        unitsPerPack: Number(order.unitsPerPack) || 0,
        expectedSaleable,
        verifiedUnits,
        likelyCountedPacks: true,
      });
    }
  }

  return rows;
}

// Self-check with fixture
const fixture: PurchaseOrder[] = [
  {
    id: 'bad',
    invoice: 'INV-1',
    invoiceLink: '',
    supplierId: 's',
    supplierSKU: 'X',
    description: 'Pack mistyped verify',
    sku: 'SKU1',
    category: '',
    line: '',
    images: [],
    quantity: 2,
    unitsPerPack: 3,
    quantityGood: 2,
    quantityProblem: 0,
    currency: 'USD',
    costPerUnit: 1,
    totalCost: 2,
    discountPerUnit: 0,
    totalDiscount: 0,
    costPerUnitWithDiscount: 1,
    totalCostWithDiscount: 2,
    exchangeRate: 1,
    costInUSD: 2,
    shippingCost: 0,
    tariffCost: 0,
    otherFees: 0,
    totalLandedCost: 2,
    landedCostPerUnit: 1,
    purchaseDate: new Date(),
    status: 'Verified',
    createdAt: new Date(),
  },
  {
    id: 'ok',
    invoice: 'INV-1',
    invoiceLink: '',
    supplierId: 's',
    supplierSKU: 'Y',
    description: 'Correct saleable verify',
    sku: 'SKU2',
    category: '',
    line: '',
    images: [],
    quantity: 2,
    unitsPerPack: 3,
    quantityGood: 6,
    quantityProblem: 0,
    currency: 'USD',
    costPerUnit: 1,
    totalCost: 2,
    discountPerUnit: 0,
    totalDiscount: 0,
    costPerUnitWithDiscount: 1,
    totalCostWithDiscount: 2,
    exchangeRate: 1,
    costInUSD: 2,
    shippingCost: 0,
    tariffCost: 0,
    otherFees: 0,
    totalLandedCost: 2,
    landedCostPerUnit: 1,
    purchaseDate: new Date(),
    status: 'Verified',
    createdAt: new Date(),
  },
];

const flagged = auditPackVerifiedAsBoxes(fixture);
if (flagged.length !== 1 || flagged[0].id !== 'bad') {
  throw new Error('audit fixture failed');
}
console.log('audit-pack-verified-as-boxes: fixture ok; flagged', flagged.length, 'line(s)');
