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
  /**
   * Cloudflare Worker proxy base for all Cloudinary clouds (recommended, free).
   * Example: https://www.filemakr.com/cloudinary
   * Maps res.cloudinary.com/{cloud}/... → {base}/{cloud}/...
   */
  cloudinaryCdnBase: (process.env.CLOUDINARY_CDN_BASE || '').toString().trim(),
  /** Optional paid Cloudinary CNAME host (e.g. images.filemakr.com). Used only if CDN_BASE is empty. */
  cloudinaryCdnHost: (process.env.CLOUDINARY_CDN_HOST || '').toString().trim(),
  gtmContainerId: (process.env.GTM_CONTAINER_ID || '').trim() || 'GTM-T6C299QC',
  ga4MeasurementId: process.env.GA4_MEASUREMENT_ID || 'G-3BRFBRR1B5',
  googleAdsConversionId: process.env.GOOGLE_ADS_CONVERSION_ID || 'AW-17121917391',
  googleAdsConversionLabel: process.env.GOOGLE_ADS_CONVERSION_LABEL || '92AdCPCm5rQcEM_zruQ_',
};
