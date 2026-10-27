'use strict';
// Ana lissafin kudi da BigInt na "minor units" (kobo/cent). Ba floating point.
const { AppError } = require('./errors');

const CURRENCIES = ['NGN', 'USD'];

function toMinor(value) {
  const s = String(value).trim();
  if (!/^\d{1,15}(\.\d{1,2})?$/.test(s)) {
    throw new AppError(400, 'INVALID_AMOUNT', 'Amount must be a positive number with at most 2 decimals');
  }
  const [whole, frac = ''] = s.split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
}

function fromMinor(minor) {
  const b = BigInt(minor);
  const sign = b < 0n ? '-' : '';
  const abs = b < 0n ? -b : b;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** feeType: 'FIXED' | 'PERCENT'. percentBps: basis points (100 = 1%). Rounds half-up. */
function calcServiceCharge({ amountMinor, feeType, fixedMinor = 0n, percentBps = 0 }) {
  const amount = BigInt(amountMinor);
  let fee;
  if (feeType === 'FIXED') fee = BigInt(fixedMinor);
  else if (feeType === 'PERCENT') fee = (amount * BigInt(percentBps) + 5000n) / 10000n;
  else throw new AppError(400, 'INVALID_FEE_TYPE', 'Unknown fee type');
  if (fee < 0n || fee >= amount) {
    throw new AppError(400, 'FEE_EXCEEDS_AMOUNT', 'Service charge must be less than the amount');
  }
  return { feeMinor: fee, netMinor: amount - fee };
}

module.exports = { CURRENCIES, toMinor, fromMinor, calcServiceCharge };
