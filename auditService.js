'use strict';
// Rubuta audit log (append-only a database). Ana iya wuce `client` don a yi shi cikin transaction.
const db = require('../config/db');

async function log(clientOrNull, { actorId = null, action, targetType = null, targetId = null, oldValue = null, newValue = null, ip = null, context = {} }) {
  const q = clientOrNull || db;
  await q.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, old_value, new_value, ip, context)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [actorId, action, targetType, targetId ? String(targetId) : null,
      oldValue === null ? null : JSON.stringify(oldValue),
      newValue === null ? null : JSON.stringify(newValue), ip, JSON.stringify(context)]
  );
}
module.exports = { log };
