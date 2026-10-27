'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const env = require('./config/env');
const { pool } = require('./config/db');
const { csrfProtection } = require('./middleware/csrf');
const { errorHandler } = require('./middleware/errorHandler');
const { AppError } = require('./utils/errors');

function createApp() {
  const app = express();
  const isProd = env.NODE_ENV === 'production';
  if (isProd) app.set('trust proxy', 1); // needed behind Render/Railway/etc. HTTPS proxies

  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'], frameAncestors: ["'none'"] } }
  }));
  app.use(express.json({ limit: '50kb' }));

  app.use(session({
    name: 'l2e.sid',
    store: new PgStore({ pool, createTableIfMissing: true }),
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: env.SESSION_MAX_AGE_MINUTES * 60 * 1000 }
  }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api', csrfProtection);
  app.use('/api/auth', require('./routes/auth'));
  // Phase 4+: /api/user, /api/admin, /api/super-admin, /api/campaigns, /api/wallet, /api/withdrawals ...

  app.use('/api', (req, res, next) => next(new AppError(404, 'NOT_FOUND', 'Not found')));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(errorHandler);
  return app;
}
module.exports = { createApp };
