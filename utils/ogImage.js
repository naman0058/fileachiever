'use strict';

const {
  cloudinaryDisplayUrl,
  isCloudinaryUploadUrl
} = require('./cloudinaryDisplay');

/** Always reachable on production (Cloudinary CDN). */
const DEFAULT_OG_IMAGE_RAW =
  'https://res.cloudinary.com/dggf8vl9p/image/upload/v1718627756/filemakr-project-file-creator-favicon_1_dqogst.avif';

const SITE_ORIGIN = 'https://www.filemakr.com';
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

function isUsableOgSource(url) {
  const u = String(url || '').trim();
  if (!u) return false;
  if (/ui-avatars\.com/i.test(u)) return false;
  if (/devicons\/devicon/i.test(u)) return false;
  if (/\.svg(?:\?|#|$)/i.test(u)) return false;
  return true;
}

function toAbsoluteUrl(raw) {
  let u = String(raw || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return SITE_ORIGIN + u;
  return SITE_ORIGIN + '/' + u.replace(/^\.?\/+/, '');
}

function formatCloudinaryOg(url) {
  return cloudinaryDisplayUrl(url, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    quality: 'auto:best'
  });
}

/**
 * Resolve a social share image URL (Open Graph / Twitter).
 * Uses project/page image when valid; otherwise Cloudinary brand fallback at 1200×630.
 *
 * @param {string} rawImage
 * @param {{ fallback?: string }} [opts]
 * @returns {string}
 */
function resolveOgImageUrl(rawImage, opts) {
  const options = opts && typeof opts === 'object' ? opts : {};
  const fallbackRaw = options.fallback || DEFAULT_OG_IMAGE_RAW;

  let candidate = String(rawImage || '').trim();
  if (!isUsableOgSource(candidate)) {
    candidate = fallbackRaw;
  }

  candidate = toAbsoluteUrl(candidate);

  if (isCloudinaryUploadUrl(candidate)) {
    return formatCloudinaryOg(candidate);
  }

  if (isUsableOgSource(candidate) && /^https?:\/\//i.test(candidate)) {
    return candidate;
  }

  return formatCloudinaryOg(fallbackRaw);
}

function defaultOgImageUrl() {
  return formatCloudinaryOg(DEFAULT_OG_IMAGE_RAW);
}

module.exports = {
  DEFAULT_OG_IMAGE_RAW,
  OG_WIDTH,
  OG_HEIGHT,
  resolveOgImageUrl,
  defaultOgImageUrl,
  isUsableOgSource
};
