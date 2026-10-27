'use strict';
// Ba a yin karya: idan ba a saita email/SMS provider ba, ana rubuta "NOT_SENT_NO_PROVIDER".
const env = require('../config/env');
const logger = require('../utils/logger');
const { getSetting } = require('./settingsService');

async function sendVerificationCode(client, { userId, channel, destination, code }) {
  const provider = channel === 'EMAIL' ? env.EMAIL_PROVIDER : env.SMS_PROVIDER;
  const channels = await getSetting('notification_channels', {});
  let status; let detail;

  if (channels[channel] === false) {
    status = 'NOT_SENT_CHANNEL_DISABLED';
    detail = 'Channel disabled by Super Admin';
  } else if (!provider || provider === 'none') {
    status = 'NOT_SENT_NO_PROVIDER';
    detail = 'No provider configured';
  } else {
    // TODO (Phase 6): real provider adapters. Until implemented we must NOT claim delivery.
    status = 'FAILED';
    detail = `Provider "${provider}" adapter not implemented yet`;
  }

  if (env.DEV_LOG_CODES === 'true' && env.NODE_ENV !== 'production') {
    logger.warn({ channel, destination, code }, 'DEV ONLY: verification code (not sent to user)');
  }
  await client.query(
    `INSERT INTO notification_delivery_logs (user_id, channel, event_type, status, provider, detail)
     VALUES ($1,$2,'VERIFICATION_CODE',$3,$4,$5)`,
    [userId, channel, status, provider || 'none', detail]
  );
  return { delivered: false, status };
}
module.exports = { sendVerificationCode };
