'use strict';
const { ZodError } = require('zod');
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

const validate = (schema) => (req, res, next) => {
  try { req.body = schema.parse(req.body); next(); } catch (e) { next(e); }
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) } });
  }
  if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}
module.exports = { errorHandler, validate };
