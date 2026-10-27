'use strict';
require('dotenv').config();
const { z } = require('zod');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_MAX_AGE_MINUTES: z.coerce.number().int().positive().default(120),
  EMAIL_PROVIDER: z.string().default('none'),
  SMS_PROVIDER: z.string().default('none'),
  PAYMENT_PROVIDER: z.string().default('none'),
  DEV_LOG_CODES: z.enum(['true', 'false']).default('false')
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const i of parsed.error.issues) console.error(` - ${i.path.join('.')}: ${i.message}`);
  process.exit(1);
}
const env = parsed.data;
if (env.NODE_ENV === 'production' && env.DEV_LOG_CODES === 'true') {
  console.error('DEV_LOG_CODES must be false in production.');
  process.exit(1);
}
module.exports = Object.freeze(env);
