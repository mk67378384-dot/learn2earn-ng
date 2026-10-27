'use strict';
const pino = require('pino');
const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: ['req.headers.cookie', 'password', '*.password', 'code', '*.code', 'password_hash']
});
module.exports = logger;
