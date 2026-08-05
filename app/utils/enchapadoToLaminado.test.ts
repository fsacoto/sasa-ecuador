import assert from 'node:assert/strict';
import {
  remapEoSkuToLo,
  remapEnchapadoLine,
  remapSkuOccurrences,
  LAMINADO_LINE,
} from './enchapadoToLaminado';
import { buildSkuPrefix } from './skuGenerator';
import { canonicalLine, displayLine } from './merchandiseLabels';

assert.equal(remapEoSkuToLo('AREO0001'), 'ARLO0001');
assert.equal(remapEoSkuToLo('areo0001-2'), 'ARLO0001-2');
assert.equal(remapEoSkuToLo('ARBO0001'), null);
assert.equal(remapEoSkuToLo('AREO12'), null);

assert.equal(remapEnchapadoLine('Enchapado en Oro'), LAMINADO_LINE);
assert.equal(remapEnchapadoLine('gold plated'), LAMINADO_LINE);
assert.equal(remapEnchapadoLine('Baño en Oro'), null);

assert.equal(buildSkuPrefix('Aretes', 'Laminado en Oro'), 'ARLO');
assert.equal(buildSkuPrefix('Aretes', 'Enchapado en Oro'), 'AREO');

assert.equal(canonicalLine('Enchapado en Oro'), LAMINADO_LINE);
assert.equal(displayLine('Enchapado en Oro'), LAMINADO_LINE);
assert.equal(canonicalLine('Laminado en Oro'), LAMINADO_LINE);

const map = new Map([['AREO0001', 'ARLO0001']]);
assert.equal(
  remapSkuOccurrences('https://x/by-sku/AREO0001/AREO0001.jpg', map),
  'https://x/by-sku/ARLO0001/ARLO0001.jpg'
);

console.log('enchapado→laminado tests OK');
