'use strict';
// Creates the first SUPER_ADMIN from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD (.env). Run once, then remove the password from .env.
const bcrypt = require('bcryptjs');
const { pool, withTransaction } = require('../src/config/db');
const audit = require('../src/services/auditService');

(async () => {
  const { SUPER_ADMIN_EMAIL: email, SUPER_ADMIN_PASSWORD: pw, SUPER_ADMIN_NAME: name = 'Super Admin' } = process.env;
  if (!email || !pw || pw.length < 12) {
    console.error('Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (min 12 chars) in .env first.');
    process.exit(1);
  }
  try {
    const hash = await bcrypt.hash(pw, 12);
    await withTransaction(async (c) => {
      const exists = await c.query(`SELECT 1 FROM users WHERE role='SUPER_ADMIN'`);
      if (exists.rowCount) throw new Error('A Super Admin already exists.');
      const u = await c.query(
        `INSERT INTO users (email, full_name, password_hash, role, email_verified_at)
         VALUES (lower($1),$2,$3,'SUPER_ADMIN', now()) RETURNING id`, [email, name, hash]);
      await c.query(`INSERT INTO wallets (user_id, currency) VALUES ($1,'NGN'),($1,'USD')`, [u.rows[0].id]);
      await audit.log(c, { actorId: u.rows[0].id, action: 'SUPER_ADMIN_BOOTSTRAPPED', targetType: 'user', targetId: u.rows[0].id });
    });
    console.log('Super Admin created. Now delete SUPER_ADMIN_PASSWORD from .env.');
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally { await pool.end(); }
})();
