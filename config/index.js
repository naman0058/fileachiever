/**
 * Application configuration
 * Load env first - required by database
 */
require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  sessionKeys: (process.env.SESSION_KEYS || 'naman').split(',').map(k => k.trim()).filter(Boolean) || ['naman'],
  siteBaseUrl: process.env.SITE_BASE_URL || 'https://www.filemakr.com',
  gtmContainerId: process.env.GTM_CONTAINER_ID || 'GTM-T6C299QC',
  ga4MeasurementId: process.env.GA4_MEASUREMENT_ID || 'G-3BRFBRR1B5',
  googleAdsConversionId: process.env.GOOGLE_ADS_CONVERSION_ID || 'AW-17121917391',
  googleAdsConversionLabel: process.env.GOOGLE_ADS_CONVERSION_LABEL || '92AdCPCm5rQcEM_zruQ_',
};
