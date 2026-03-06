/**
 * Application configuration
 * Load env first - required by database
 */
require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  sessionKeys: (process.env.SESSION_KEYS || 'naman').split(',').map(k => k.trim()).filter(Boolean) || ['naman'],
  siteBaseUrl: process.env.SITE_BASE_URL || 'https://filemakr.com',
};
