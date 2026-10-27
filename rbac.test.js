'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { requireRole } = require('../src/middleware/auth');

const run = (mw, user) => new Promise((resolve) => mw({ user }, {}, (err) => resolve(err)));

test('USER cannot access SUPER_ADMIN route', async () => {
  const err = await run(requireRole('SUPER_ADMIN'), { role: 'USER' });
  assert.equal(err.status, 403);
});
test('ADMIN cannot access SUPER_ADMIN route', async () => {
  const err = await run(requireRole('SUPER_ADMIN'), { role: 'ADMIN' });
  assert.equal(err.status, 403);
});
test('SUPER_ADMIN passes', async () => {
  assert.equal(await run(requireRole('SUPER_ADMIN'), { role: 'SUPER_ADMIN' }), undefined);
});
test('missing user is rejected', async () => {
  assert.equal((await run(requireRole('USER'), undefined)).status, 403);
});
