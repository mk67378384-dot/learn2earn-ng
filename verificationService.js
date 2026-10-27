'use strict';
const crypto = require('crypto');
const env = require('../config/env');
const db = require('../config/db');
const { AppError } = require('../utils/errors');
const { sendVerificationCode } = require('./notificationService');

const CODE_TTL_MIN = 15;
const MAX_ATTEMPTS = 5;

const hashCode = (userId, channel, code) =>
  crypto.createHmac('sha256', env.SESSION_SECRET).update(`${userId}:${channel}:${code}`).digest('hex');

async function issueCode(client, user, channel) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await client.query(
    `INSERT INTO verification_codes (user_id, channel, code_hash, expires_at)
     VALUES ($1,$2,$3, now() + ($4 || ' minutes')::interval)`,
    [user.id, channel, hashCode(user.id, channel, code), String(CODE_TTL_MIN)]
  );
  const destination = channel === 'EMAIL' ? user.email : user.phone;
  return sendVerificationCode(client, { userId: user.id, channel, destination, code });
}

async function confirmCode(userId, channel, code) {
  return db.withTransaction(async (c) => {
    const r = await c.query(
      `SELECT id, code_hash, attempts FROM verification_codes
       WHERE user_id=$1 AND channel=$2 AND consumed_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [userId, channel]);
    if (!r.rowCount) throw new AppError(400, 'CODE_INVALID', 'Code is invalid or expired');
    const row = r.rows[0];
    if (row.attempts >= MAX_ATTEMPTS) throw new AppError(429, 'CODE_LOCKED', 'Too many attempts. Request a new code.');
    await c.query('UPDATE verification_codes SET attempts = attempts + 1 WHERE id=$1', [row.id]);

    const expected = Buffer.from(row.code_hash, 'hex');
    const actual = Buffer.from(hashCode(userId, channel, code), 'hex');
    if (!crypto.timingSafeEqual(expected, actual)) {
      // Persist the attempt counter even though we reject.
      await c.query('COMMIT'); await c.query('BEGIN');
      throw new AppError(400, 'CODE_INVALID', 'Code is invalid or expired');
    }
    await c.query('UPDATE verification_codes SET consumed_at = now() WHERE id=$1', [row.id]);
    const col = channel === 'EMAIL' ? 'email_verified_at' : 'phone_verified_at';
    await c.query(`UPDATE users SET ${col} = now(), updated_at = now() WHERE id=$1`, [userId]);
    return true;
  });
}
module.exports = { issueCode, confirmCode };
