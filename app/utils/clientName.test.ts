import assert from 'node:assert/strict';
import {
  joinClientName,
  splitClientName,
  titleCaseWords,
  titleCaseWordsInput,
} from './clientName.ts';

assert.equal(titleCaseWords('juan salazar'), 'Juan Salazar');
assert.equal(titleCaseWords('  MARÍA  jose  '), 'María Jose');
assert.equal(titleCaseWords('ana-lucía pérez'), 'Ana-Lucía Pérez');
assert.equal(titleCaseWordsInput('juan '), 'Juan ');
assert.deepEqual(splitClientName('Juan Salazar Vega'), {
  firstName: 'Juan',
  lastName: 'Salazar Vega',
});
assert.equal(joinClientName('juan', 'salazar'), 'Juan Salazar');

console.log('clientName tests OK');
