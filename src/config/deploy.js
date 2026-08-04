/** Deployment configuration shared across Git Deploy service */
const path = require('path');

const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'https://panel.meedo51.com';

module.exports = {
  DEPLOY_BASE_PATH: '/home/{user}/deployments',
  DOMAINS_BASE_PATH: '/home/{user}/domains',
  LOGS_PATH: '/home/{user}/logs',
  DATA_DIR: path.join(__dirname, '..', '..', 'data'),
  DEPLOYMENTS_FILE: 'deployments.json',
  DEPLOY_KEYS_FILE: 'deploy_keys.json',
  DEPLOY_ENV_VARS_FILE: 'deploy_env_vars.json',
  SCRIPTS_DIR: path.join(__dirname, '..', '..', 'scripts', 'deploy'),
  MAX_DEPLOYMENTS_KEPT: 5,
  MAX_CONCURRENT_PER_USER: 3,
  DEPLOY_TIMEOUT: 10 * 60 * 1000,
  GIT_CLONE_DEPTH: 1,
  APP_PORT_START: 41000,
  APP_PORT_END: 49999,
  WEBHOOK_BASE_URL,
  WEBHOOK_PATH_PREFIX: '/webhook',
};
