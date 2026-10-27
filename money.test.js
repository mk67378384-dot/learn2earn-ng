'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toMinor, fromMinor, calcServiceCharge } = require('../src/utils/money');

test('toMinor / fromMinor round trip without float errors', () => {
  assert.equal(toMinor('1000'), 100000n);
  assert.equal(toMinor('0.1') + toMinor('0.2'), toMinor('0.3'));
  assert.equal(fromMinor(123456n), '1234.56');
  assert.equal(fromMinor(5n), '0.05');
});
test('toMinor rejects bad input', () => {
  for (const bad of ['-5', '1.234', 'abc', '', '1e3']) assert.throws(() => toMinor(bad));
});
test('fixed and percent service charge', () => {
  const f = calcServiceCharge({ amountMinor: toMinor('1000'), feeType: 'FIXED', fixedMinor: toMinor('50') });
  assert.equal(fromMinor(f.feeMinor), '50.00'); assert.equal(fromMinor(f.netMinor), '950.00');
  const p = calcServiceCharge({ amountMinor: toMinor('1000'), feeType: 'PERCENT', percentBps: 150 });
  assert.equal(fromMinor(p.feeMinor), '15.00');
});
test('fee equal to or above amount is rejected', () => {
  assert.throws(() => calcServiceCharge({ amountMinor: 1000n, feeType: 'FIXED', fixedMinor: 1000n }));
});
