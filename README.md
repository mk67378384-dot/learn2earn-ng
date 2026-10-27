# Learn2Earn NG — Phase 1–2 (Foundation)

Rewards platform for students and unemployed people. **Status: foundation only. Not production-ready.**

## Status (honest)
| Feature | Status |
|---|---|
| Project structure, env validation, logging | Implemented |
| PostgreSQL schema + migration runner (all core tables, append-only ledger & audit triggers) | Implemented, **not yet run against a live DB** |
| Register / login / logout / sessions / CSRF / rate limit / lockout | Implemented, **not yet integration-tested** |
| Email & phone verification codes (hashed) | Implemented; **no real email/SMS provider** — delivery is logged as `NOT_SENT_NO_PROVIDER` |
| Role + permission middleware | Implemented; unit-tested (`requireRole`) |
| Money helpers (BigInt, fee calc) | Implemented, unit-tested (8 tests pass) |
| Password reset | Not yet |
| Dashboards, campaigns, rewards, wallet ops, referrals payout, withdrawals, Friday scheduler, Auto Withdrawal, retries, PDF receipts, payment providers, admin salary | **Not yet implemented** (Phases 3–6) |

Dependency versions in `package.json` are ranges chosen from my knowledge; run `npm install` to generate `package-lock.json` and commit it. I could not run `npm install` in my build environment (no network), so dependencies are **untested together**.

## Requirements
Node.js 20+, PostgreSQL 13+, npm.

## Setup
1. `npm install`
2. `cp .env.example .env` and fill `DATABASE_URL` and `SESSION_SECRET` (32+ random chars).
3. Create a database: `createdb learn2earn`
4. `npm run migrate`
5. Set `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` in `.env`, run `npm run create-super-admin`, then delete the password from `.env`.
6. `npm run dev` → http://localhost:3000 (health check: `/health`)
7. `npm test`

## API (so far)
All `POST` calls need header `X-CSRF-Token` (get it from `GET /api/auth/csrf`, using the same cookie session).
`POST /api/auth/register`, `/login`, `/logout`, `/verify/email`, `/verify/phone`, `/verify/resend`; `GET /api/auth/me`.

## Dev testing without email/SMS
Set `DEV_LOG_CODES=true` (never in production): codes are printed in the server log only.

## Security notes
Passwords: bcrypt cost 12. Codes: HMAC-SHA256, 15 min expiry, 5 attempts. Sessions: HttpOnly, SameSite=Lax, Secure in production, regenerated at login. Ledger and audit tables reject UPDATE/DELETE at database level.

## Hosting
Not verified. Free hosts often sleep, lack background jobs or persistent Postgres. The Friday payout job (Phase 5) needs an always-on process or an external scheduler.
