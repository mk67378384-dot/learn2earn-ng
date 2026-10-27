'use strict';
const crypto = require('crypto');
const { AppError } = require('../utils/errors');

function issueToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

/** Unsafe methods must send header X-CSRF-Token equal to the token stored in the session. */
function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = req.get('x-csrf-token') || '';
  const real = req.session && req.session.csrfToken;
  const a = Buffer.from(sent); const b = Buffer.from(real || '');
  if (!real || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return next(new AppError(403, 'CSRF_INVALID', 'Invalid or missing CSRF token'));
  }
  next();
}
module.exports = { issueToken, csrfProtection };
