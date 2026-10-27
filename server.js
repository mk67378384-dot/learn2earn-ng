'use strict';
const env = require('./src/config/env');
const logger = require('./src/utils/logger');
const { createApp } = require('./src/app');
const { pool } = require('./src/config/db');

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Learn2Earn NG server started');
});

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
