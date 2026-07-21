import assert from 'node:assert/strict';
import { matchInventorySkuFromImageFilename } from './inventoryBulkImageFilename';

const skus = ['ANBO0009', 'JOMA0001', 'JOMA0001-2', 'SKU-WITH-DASH'];

assert.deepEqual(matchInventorySkuFromImageFilename('ANBO0009.jpg', skus), {
  sku: 'ANBO0009',
  sequence: 1,
});
assert.deepEqual(matchInventorySkuFromImageFilename('anbo0009_2.PNG', skus), {
  sku: 'ANBO0009',
  sequence: 2,
});
assert.deepEqual(matchInventorySkuFromImageFilename('ANBO0009-3.webp', skus), {
  sku: 'ANBO0009',
  sequence: 3,
});
assert.deepEqual(matchInventorySkuFromImageFilename('JOMA0001-2.jpg', skus), {
  sku: 'JOMA0001-2',
  sequence: 1,
});
assert.deepEqual(matchInventorySkuFromImageFilename('JOMA0001-2_2.jpg', skus), {
  sku: 'JOMA0001-2',
  sequence: 2,
});
assert.deepEqual(matchInventorySkuFromImageFilename('SKU-WITH-DASH-4.jpg', skus), {
  sku: 'SKU-WITH-DASH',
  sequence: 4,
});
assert.equal(matchInventorySkuFromImageFilename('UNKNOWN.jpg', skus), null);
assert.equal(matchInventorySkuFromImageFilename('ANBO0009_extra.jpg', skus), null);

console.log('inventoryBulkImageFilename tests passed');
