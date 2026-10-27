'use strict';
const db = require('../config/db');

async function getSetting(key, fallback = null) {
  const r = await db.query('SELECT value FROM platform_settings WHERE key=$1', [key]);
  return r.rowCount ? r.rows[0].value : fallback;
}
module.exports = { getSetting };
