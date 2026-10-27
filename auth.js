'use strict';
const { z } = require('zod');

const password = z.string().min(10, 'Password must be at least 10 characters').max(128)
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Password must contain letters and numbers');

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().regex(/^\+?\d{10,15}$/, 'Enter a valid phone number'),
  password,
  referralCode: z.string().trim().max(20).optional().or(z.literal(''))
}).strict();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128)
}).strict();

const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits') }).strict();
const resendSchema = z.object({ channel: z.enum(['EMAIL', 'PHONE']) }).strict();

module.exports = { registerSchema, loginSchema, codeSchema, resendSchema };
