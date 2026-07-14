/**
 * Lightweight assertions — run: npx tsx app/utils/purchaseOrderPack.test.ts
 */
import type { PurchaseOrder } from '../types';
import {
  boxSetExtraLabelCount,
  costAllocationUnits,
  effectiveUnitsPerPack,
  expectedSaleableQuantity,
  isPackBased,
  landedCostPerSaleableUnit,
  normalizeUnitsPerPackInput,
} from './purchaseOrderPack';
import { getScanProgress } from './purchaseOrderBarcodeScan';
import { labelCountForExtraPrint, labelCountForFullPrint } from './barcodePrint';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function baseOrder(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: '1',
    invoice: 'INV-100',
    invoiceLink: '',
    supplierId: 'sup1',
    supplierSKU: 'SUP-ABC',
    description: 'Socks',
    sku: 'PUBO0001',
    category: 'PU',
    line: 'BO',
    images: [],
    quantity: 2,
    currency: 'USD',
    costPerUnit: 30,
    totalCost: 60,
    discountPerUnit: 0,
    totalDiscount: 0,
    costPerUnitWithDiscount: 30,
    totalCostWithDiscount: 60,
    exchangeRate: 1,
    costInUSD: 60,
    shippingCost: 0,
    tariffCost: 0,
    otherFees: 0,
    totalLandedCost: 60,
    landedCostPerUnit: 30,
    purchaseDate: new Date(),
    status: 'Received',
    createdAt: new Date(),
    ...overrides,
  };
}

// Unit line (no pack)
const unit = baseOrder({ quantity: 5 });
assert(effectiveUnitsPerPack(unit) === 1, 'unit effectivePerPack=1');
assert(!isPackBased(unit), 'unit not pack-based');
assert(expectedSaleableQuantity(unit) === 5, 'unit saleable=qty');
assert(boxSetExtraLabelCount(unit) === 0, 'unit no extras');
assert(costAllocationUnits(unit) === 5, 'unit cost units=qty');

// Pack: qty=2 × perPack=3 → 6 saleable, 4 extras
const pack = baseOrder({ quantity: 2, unitsPerPack: 3 });
assert(effectiveUnitsPerPack(pack) === 3, 'pack effective=3');
assert(isPackBased(pack), 'pack is pack-based');
assert(expectedSaleableQuantity(pack) === 6, '2×3=6 saleable');
assert(boxSetExtraLabelCount(pack) === 4, '6−2=4 extras');
assert(costAllocationUnits(pack) === 6, 'cost dilutes over 6');
assert(Math.abs(landedCostPerSaleableUnit(pack) - 10) < 1e-9, '60/6=10 unit cost');

// Edge: unitsPerPack=1 treated as unit
assert(!isPackBased(baseOrder({ unitsPerPack: 1 })), 'perPack=1 is unit');
assert(expectedSaleableQuantity(baseOrder({ quantity: 4, unitsPerPack: 1 })) === 4, 'perPack=1 saleable=qty');

// normalize
assert(normalizeUnitsPerPackInput(null) === null, 'null clears');
assert(normalizeUnitsPerPackInput(1) === null, '1 clears');
assert(normalizeUnitsPerPackInput(2.9) === 2, 'floor to 2');

// Scanner expects saleables
const scan = getScanProgress(baseOrder({ quantity: 2, unitsPerPack: 3, quantityScanned: 4 }));
assert(scan.expected === 6 && scan.scanned === 4 && scan.remaining === 2, 'scanner expected=6');
assert(getScanProgress(baseOrder({ quantity: 2, unitsPerPack: 3, quantityScanned: 6 })).isComplete, 'scan complete at 6');

// Labels full = saleable; extras = saleable − qty
assert(labelCountForFullPrint(pack, null) === 6, 'full print 6');
assert(labelCountForExtraPrint(pack) === 4, 'extra print 4');
assert(labelCountForExtraPrint(unit) === 0, 'unit extra 0');

console.log('purchaseOrderPack.test.ts: all passed');
