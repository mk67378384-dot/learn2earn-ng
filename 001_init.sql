-- Learn2Earn NG - initial schema. Money: NUMERIC(20,2). Currency stored on every financial row.
-- (gen_random_uuid() is built in on PostgreSQL 13+.)

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  phone TEXT,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('SUPER_ADMIN','ADMIN','USER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
  email_verified_at TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,
  failed_login_count INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  referred_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));
CREATE UNIQUE INDEX users_phone_uq ON users (phone) WHERE phone IS NOT NULL;
CREATE INDEX users_role_idx ON users (role);

CREATE TABLE admin_permissions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

-- Replaces email_verifications + phone_verifications (channel column). Codes stored only as HMAC hashes.
CREATE TABLE verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('EMAIL','PHONE')),
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX verification_codes_lookup_idx ON verification_codes (user_id, channel, created_at DESC);

CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('NGN','USD')),
  available NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (available >= 0),
  reserved NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, currency)
);

-- Append-only ledger (see trigger below).
CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id),
  user_id UUID NOT NULL REFERENCES users(id),
  currency TEXT NOT NULL CHECK (currency IN ('NGN','USD')),
  type TEXT NOT NULL CHECK (type IN ('REWARD_CREDIT','REFERRAL_CREDIT','ADMIN_CREDIT','WITHDRAWAL_RESERVE','WITHDRAWAL_RELEASE','WITHDRAWAL_PAID','REVERSAL','CORRECTION')),
  amount NUMERIC(20,2) NOT NULL CHECK (amount > 0),
  balance_before NUMERIC(20,2) NOT NULL,
  balance_after NUMERIC(20,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','REVERSED')),
  related_type TEXT,
  related_id UUID,
  description TEXT,
  actor_id UUID REFERENCES users(id),
  external_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX wallet_tx_user_idx ON wallet_transactions (user_id, created_at DESC);
-- One ledger entry per (type, source): blocks duplicate credits for the same reward/withdrawal.
CREATE UNIQUE INDEX wallet_tx_source_uq ON wallet_transactions (type, related_type, related_id) WHERE related_id IS NOT NULL;

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  sponsor TEXT,
  category TEXT NOT NULL CHECK (category IN ('THIRD_PARTY','SPONSORED')),
  campaign_type TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING','ACTIVE','PAUSED','COMPLETED','CANCELLED')),
  currency TEXT NOT NULL CHECK (currency IN ('NGN','USD')),
  budget NUMERIC(20,2) NOT NULL CHECK (budget >= 0),
  spent NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (spent >= 0),
  reward_amount NUMERIC(20,2) NOT NULL CHECK (reward_amount > 0),
  max_completions INT CHECK (max_completions > 0),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  eligibility JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_method TEXT NOT NULL DEFAULT 'MANUAL_REVIEW',
  owner_admin_id UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (spent <= budget)
);
CREATE INDEX campaigns_status_idx ON campaigns (status, starts_at, ends_at);

CREATE TABLE campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  user_id UUID NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  provider_reference TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, idempotency_key)
);

CREATE TABLE rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  campaign_id UUID REFERENCES campaigns(id),
  campaign_event_id UUID REFERENCES campaign_events(id),
  currency TEXT NOT NULL CHECK (currency IN ('NGN','USD')),
  amount NUMERIC(20,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','CREDITED','REJECTED','REVERSED')),
  decided_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_event_id)
);
CREATE INDEX rewards_user_idx ON rewards (user_id, status);

CREATE TABLE withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id),
  currency TEXT NOT NULL CHECK (currency IN ('NGN','USD')),
  amount NUMERIC(20,2) NOT NULL CHECK (amount > 0),
  service_charge NUMERIC(20,2) NOT NULL CHECK (service_charge >= 0),
  net_amount NUMERIC(20,2) NOT NULL CHECK (net_amount > 0),
  method TEXT NOT NULL CHECK (method IN ('BANK_TRANSFER','E_WALLET')),
  payout_details_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','ELIGIBILITY_CHECK','APPROVED','SCHEDULED','PROCESSING','PAID','REJECTED','FAILED','CANCELLED','NEEDS_REVIEW')),
  scheduled_for TIMESTAMPTZ,
  rejection_reason TEXT,
  external_reference TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX withdrawals_user_idx ON withdrawal_requests (user_id, created_at DESC);
CREATE INDEX withdrawals_queue_idx ON withdrawal_requests (status, scheduled_for);

CREATE TABLE payout_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_for TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED','SKIPPED','PAUSED')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (scheduled_for)
);

CREATE TABLE payout_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id UUID NOT NULL REFERENCES withdrawal_requests(id),
  payout_run_id UUID REFERENCES payout_runs(id),
  attempt_number INT NOT NULL DEFAULT 1,
  provider TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'INITIATED' CHECK (status IN ('INITIATED','PENDING_PROVIDER','SUCCEEDED','FAILED','UNCERTAIN')),
  is_sandbox BOOLEAN NOT NULL DEFAULT true,
  provider_reference TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (withdrawal_id, attempt_number)
);

CREATE TABLE payment_provider_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE TABLE payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE,
  withdrawal_id UUID NOT NULL UNIQUE REFERENCES withdrawal_requests(id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE referral_codes (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id),
  referred_user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','QUALIFIED','REWARDED','REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  qualified_at TIMESTAMPTZ,
  CHECK (referrer_id <> referred_user_id)
);

CREATE TABLE admin_compensation (
  admin_id UUID PRIMARY KEY REFERENCES users(id),
  salary_amount NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (salary_amount >= 0),
  salary_currency TEXT NOT NULL DEFAULT 'NGN' CHECK (salary_currency IN ('NGN','USD')),
  salary_period TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (salary_period IN ('WEEKLY','MONTHLY')),
  commission_type TEXT NOT NULL DEFAULT 'NONE' CHECK (commission_type IN ('NONE','FIXED','PERCENT')),
  commission_value NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (commission_value >= 0),
  commission_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE salary_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES users(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('NGN','USD')),
  amount NUMERIC(20,2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'CALCULATED' CHECK (status IN ('CALCULATED','APPROVED','PAID','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (admin_id, period_start, period_end)
);

CREATE TABLE commission_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES users(id),
  campaign_id UUID REFERENCES campaigns(id),
  currency TEXT NOT NULL CHECK (currency IN ('NGN','USD')),
  amount NUMERIC(20,2) NOT NULL CHECK (amount >= 0),
  basis JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'CALCULATED' CHECK (status IN ('CALCULATED','APPROVED','PAID','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_credit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES users(id),
  target_user_id UUID NOT NULL REFERENCES users(id),
  currency TEXT NOT NULL CHECK (currency IN ('NGN','USD')),
  amount NUMERIC(20,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL CHECK (reason IN ('VERIFIED_EXTERNAL_FUNDING','ACCOUNT_CORRECTION','APPROVED_COMPENSATION','OTHER_CONFIGURED')),
  reference TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','EXECUTED')),
  decided_by UUID REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (decided_by IS NULL OR decided_by <> requested_by)
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE notification_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('WEBSITE','EMAIL','SMS')),
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','SENT','FAILED','NOT_SENT_NO_PROVIDER','NOT_SENT_CHANNEL_DISABLED')),
  provider TEXT,
  provider_message_id TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  old_value JSONB,
  new_value JSONB,
  ip TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id, created_at DESC);

-- Tamper resistance: ledger and audit log can never be edited or deleted.
CREATE FUNCTION prevent_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER wallet_tx_append_only BEFORE UPDATE OR DELETE ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- Safe defaults. Auto Withdrawal and all provider-dependent features start OFF.
INSERT INTO platform_settings (key, value) VALUES
 ('registration_enabled', 'true'),
 ('email_verification_required', 'true'),
 ('phone_verification_required', 'true'),
 ('maintenance_mode', 'false'),
 ('currency_ngn_enabled', 'true'),
 ('currency_usd_enabled', 'true'),
 ('withdrawal_min', '{"NGN":"1000.00","USD":"5.00"}'),
 ('withdrawal_max', '{"NGN":null,"USD":null}'),
 ('withdrawal_fee', '{"NGN":{"type":"FIXED","fixed":"0.00","percentBps":0},"USD":{"type":"FIXED","fixed":"0.00","percentBps":0}}'),
 ('payout_schedule', '{"active":true,"weekday":5,"time":"12:00","timezone":"Africa/Lagos","holidayPolicy":"MANUAL_DECISION","holidays":[],"exceptionalDates":[],"paused":false,"missedRunPolicy":"NEEDS_REVIEW"}'),
 ('auto_withdrawal_enabled', 'false'),
 ('retry_policy', '{"enabled":false,"maxAttempts":3,"intervalMinutes":60}'),
 ('notification_channels', '{"WEBSITE":true,"EMAIL":false,"SMS":false}'),
 ('referral_program', '{"enabled":false,"reward":{"NGN":"0.00","USD":"0.00"},"requireVerifiedEmail":true,"requireVerifiedPhone":true}');
