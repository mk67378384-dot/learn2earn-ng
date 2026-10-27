'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { AppError } = require('../utils/errors');
const { getSetting } = require('./settingsService');
const { issueCode } = require('./verificationService');
const audit = require('./auditService');

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
// Used so that unknown emails take the same time as wrong passwords.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

const publicUser = (u) => ({
  id: u.id, fullName: u.full_name, email: u.email, phone: u.phone, role: u.role, status: u.status,
  emailVerified: !!u.email_verified_at, phoneVerified: !!u.phone_verified_at
});

async function register(input, ip) {
  if (!(await getSetting('registration_enabled', true))) {
    throw new AppError(403, 'REGISTRATION_CLOSED', 'Registration is currently closed');
  }
  const hash = await bcrypt.hash(input.password, 12);
  return db.withTransaction(async (c) => {
    let referrerId = null;
    if (input.referralCode) {
      const r = await c.query('SELECT user_id FROM referral_codes WHERE code=$1', [input.referralCode.toUpperCase()]);
      referrerId = r.rowCount ? r.rows[0].user_id : null;
    }
    let user;
    try {
      const ins = await c.query(
        `INSERT INTO users (email, phone, full_name, password_hash, referred_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [input.email, input.phone, input.fullName, hash, referrerId]);
      user = ins.rows[0];
    } catch (e) {
      if (e.code === '23505') throw new AppError(409, 'ACCOUNT_EXISTS', 'An account with these details already exists');
      throw e;
    }
    await c.query(`INSERT INTO wallets (user_id, currency) VALUES ($1,'NGN'), ($1,'USD')`, [user.id]);
    const code = crypto.randomBytes(5).toString('hex').toUpperCase();
    await c.query('INSERT INTO referral_codes (user_id, code) VALUES ($1,$2)', [user.id, code]);
    // Referral is only recorded as PENDING. No bonus is paid for a link visit or bare registration.
    if (referrerId) await c.query('INSERT INTO referrals (referrer_id, referred_user_id) VALUES ($1,$2)', [referrerId, user.id]);

    const emailSend = await issueCode(c, user, 'EMAIL');
    const phoneSend = await issueCode(c, user, 'PHONE');
    await audit.log(c, { actorId: user.id, action: 'USER_REGISTERED', targetType: 'user', targetId: user.id, ip });
    return { user: publicUser(user), verification: { email: emailSend.status, phone: phoneSend.status } };
  });
}

async function login(email, password, ip) {
  const r = await db.query('SELECT * FROM users WHERE lower(email)=lower($1)', [email]);
  const user = r.rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  const generic = new AppError(401, 'BAD_CREDENTIALS', 'Incorrect email or password');

  if (!user) throw generic;
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
  }
  if (!ok) {
    const failed = user.failed_login_count + 1;
    const lock = failed >= MAX_FAILED;
    await db.query(
      `UPDATE users SET failed_login_count=$2, locked_until = CASE WHEN $3 THEN now() + ($4 || ' minutes')::interval ELSE locked_until END WHERE id=$1`,
      [user.id, lock ? 0 : failed, lock, String(LOCK_MINUTES)]);
    await audit.log(null, { actorId: user.id, action: 'LOGIN_FAILED', targetType: 'user', targetId: user.id, ip });
    throw generic;
  }
  if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended');
  await db.query('UPDATE users SET failed_login_count=0, locked_until=NULL, last_login_at=now() WHERE id=$1', [user.id]);
  await audit.log(null, { actorId: user.id, action: 'LOGIN_OK', targetType: 'user', targetId: user.id, ip });
  return publicUser(user);
}

module.exports = { register, login, publicUser };
