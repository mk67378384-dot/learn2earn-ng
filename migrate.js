'use strict';
// Runs database/migrations/*.sql in order. Each file runs once (tracked in schema_migrations).
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

(async () => {
  const dir = path.join(__dirname, '..', 'database', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    for (const file of files) {
      const done = await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [file]);
      if (done.rowCount) { console.log(`skip   ${file}`); continue; }
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`applied ${file}`);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error(`FAILED ${file}: ${e.message}`);
        process.exitCode = 1;
        break;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
})();
