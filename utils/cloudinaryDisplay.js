'use strict';

/**
 * Frontend-only Cloudinary URL helpers (f_auto, q_auto:best, width + optional CDN proxy).
 * Do NOT use for Word/PDF download binary fetches — keep res.cloudinary.com originals.
 *
 * Preferred (Cloudflare Worker, free): CLOUDINARY_CDN_BASE=https://www.filemakr.com/cloudinary
 *   res.cloudinary.com/{cloud}/image/upload/...
 *   → www.filemakr.com/cloudinary/{cloud}/image/upload/...
 *
 * Optional (paid Cloudinary CNAME): CLOUDINARY_CDN_HOST=images.filemakr.com
 *
 * Default quality is q_auto:best (not plain q_auto) so listing thumbs stay sharp on retina.
 */

/** Default delivery quality — avoids soft q_auto/eco on illustrations. */
const DEFAULT_QUALITY = 'auto:best';

function readConfig() {
  try {
    return require('../config');
  } catch (_) {
    return {};
  }
}

function getCdnBase() {
  const config = readConfig();
  let base = (config.cloudinaryCdnBase || process.env.CLOUDINARY_CDN_BASE || '')
    .toString()
    .trim()
    .replace(/\/$/, '');
  return base;
}

function getCdnHost() {
  const config = readConfig();
  const h = (config.cloudinaryCdnHost || process.env.CLOUDINARY_CDN_HOST || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  return h;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Match res.cloudinary.com, Worker proxy base (/cloudinary/), or custom CDN host. */
function isCloudinaryUploadUrl(url) {
  const u = String(url || '').trim();
  if (!u) return false;
  if (/^(https?:)?\/\/res\.cloudinary\.com\/[^/]+\/(?:image|video|raw)\/upload\//i.test(u)) {
    return true;
  }
  // Worker proxy on any host (www or bare): /cloudinary/{cloud}/image/upload/...
  if (/^(https?:)?\/\/(?:www\.)?[^/]+\/cloudinary\/[^/]+\/(?:image|video|raw)\/upload\//i.test(u)) {
    return true;
  }
  const base = getCdnBase();
  if (base) {
    const norm = (s) =>
      String(s || '')
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .replace(/\/$/, '')
        .toLowerCase();
    if (norm(u).startsWith(norm(base) + '/')) return true;
  }
  const host = getCdnHost();
  if (host) {
    const re = new RegExp(
      `^(https?:)?\\/\\/(?:www\\.)?${escapeRegExp(host.replace(/^www\./, ''))}\\/[^/]+\\/(?:image|video|raw)\\/upload\\/`,
      'i'
    );
    if (re.test(u)) return true;
  }
  return false;
}

function isResCloudinaryHost(url) {
  return /^https?:\/\/res\.cloudinary\.com\//i.test(String(url || '').trim());
}

/**
 * Rewrite res.cloudinary.com → Worker path base or custom CDN host (any cloud).
 */
function toCloudinaryCdnUrl(url) {
  const raw = String(url || '').trim();
  if (!raw || !isResCloudinaryHost(raw)) return raw;

  const base = getCdnBase();
  if (base) {
    return raw.replace(/^https?:\/\/res\.cloudinary\.com/i, base);
  }
  const host = getCdnHost();
  if (host) {
    return raw.replace(/^https?:\/\/res\.cloudinary\.com/i, `https://${host}`);
  }
  return raw;
}

/** True if the first segment after /upload/ is a transform chain (not v123 version). */
function hasExistingTransforms(url) {
  const u = String(url || '');
  const lower = u.toLowerCase();
  let marker = '/image/upload/';
  if (!lower.includes(marker)) {
    if (lower.includes('/video/upload/')) marker = '/video/upload/';
    else if (lower.includes('/raw/upload/')) marker = '/raw/upload/';
    else return false;
  }
  const after = u.slice(lower.indexOf(marker) + marker.length);
  const first = after.split('/')[0] || '';
  if (!first) return false;
  if (/^v\d+$/i.test(first)) return false;
  return /[_]|[,]|^(f_|q_|w_|h_|c_|dpr_|e_)/i.test(first);
}

function injectUploadTransforms(url, transform) {
  return String(url).replace(
    /(\/(?:image|video|raw)\/upload\/)/i,
    `$1${transform}/`
  );
}

/** Normalize quality option → Cloudinary q_ token (e.g. auto:best → q_auto:best). */
function qualityToken(quality) {
  if (quality == null || quality === '') return 'q_' + DEFAULT_QUALITY;
  const q = String(quality).replace(/^q_/, '').trim();
  if (!q || q === 'auto') return 'q_' + DEFAULT_QUALITY;
  return 'q_' + q;
}

/**
 * Upgrade soft auto quality (q_auto, q_auto:eco, q_auto:low) → q_auto:best.
 * Leaves explicit numeric qualities alone.
 */
function upgradeSoftQuality(url) {
  return String(url || '').replace(
    /(\/(?:image|video|raw)\/upload\/)([^/]*)/i,
    (full, prefix, tx) => {
      if (!tx || /^v\d+$/i.test(tx)) return full;
      const parts = tx.split(',').map((p) => p.trim()).filter(Boolean);
      let changed = false;
      const next = parts.map((p) => {
        if (/^q_auto(?::(?:eco|low))?$/i.test(p) || /^q_auto$/i.test(p)) {
          changed = true;
          return 'q_auto:best';
        }
        return p;
      });
      return changed ? prefix + next.join(',') : full;
    }
  );
}

function injectWidthTransform(url, width, sharpen) {
  const n = parseInt(width, 10);
  if (!Number.isFinite(n) || n <= 0) return url;
  const useSharpen = sharpen !== false && n <= 1280;
  return String(url).replace(
    /(\/(?:image|video|raw)\/upload\/)([^/]*)(\/|$)/i,
    (full, prefix, tx, z) => {
      let parts;
      if (!tx || /^v\d+$/i.test(tx)) {
        parts = ['f_auto', 'q_auto:best', 'w_' + n, 'c_limit'];
        if (useSharpen) parts.push('e_sharpen:60');
        return prefix + parts.join(',') + (z === '/' ? '/' : z || '/');
      }
      parts = tx
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .filter((p) => !/^w_/i.test(p) && !/^e_sharpen/i.test(p));
      if (!parts.some((p) => /^f_/i.test(p))) parts.unshift('f_auto');
      if (!parts.some((p) => /^q_/i.test(p))) parts.push('q_auto:best');
      parts.push('w_' + n);
      if (!parts.some((p) => /^c_/i.test(p))) parts.push('c_limit');
      if (useSharpen) parts.push('e_sharpen:60');
      return prefix + parts.join(',') + (z || '');
    }
  );
}

/**
 * @param {string} url
 * @param {{ width?: number, quality?: string|number, height?: number, skipCdn?: boolean, sharpen?: boolean }} [opts]
 */
function cloudinaryDisplayUrl(url, opts) {
  const options = opts && typeof opts === 'object' ? opts : {};
  let raw = String(url || '').trim();
  if (!raw) return '';
  if (!isCloudinaryUploadUrl(raw)) return raw;

  const w = parseInt(options.width, 10);
  const sharpen = options.sharpen !== false && Number.isFinite(w) && w > 0 && w <= 1280;

  if (!hasExistingTransforms(raw)) {
    const parts = ['f_auto', qualityToken(options.quality)];
    if (Number.isFinite(w) && w > 0) {
      parts.push('w_' + w);
      parts.push('c_limit');
      if (sharpen) parts.push('e_sharpen:60');
    }
    const h = parseInt(options.height, 10);
    if (Number.isFinite(h) && h > 0) {
      parts.push('h_' + h);
      if (!parts.includes('c_limit')) parts.push('c_limit');
    }
    raw = injectUploadTransforms(raw, parts.join(','));
  } else {
    raw = upgradeSoftQuality(raw);
    if (Number.isFinite(w) && w > 0) {
      raw = injectWidthTransform(raw, w, sharpen);
    }
  }

  if (options.skipCdn) return raw;
  return toCloudinaryCdnUrl(raw);
}

function cloudinarySrcSet(url, widths) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const list = Array.isArray(widths) && widths.length
    ? widths.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n) && n > 0)
    : [640, 960, 1280];
  if (!isCloudinaryUploadUrl(raw)) {
    return list.length ? `${raw} ${list[0]}w` : raw;
  }
  return list
    .map((w) => `${cloudinaryDisplayUrl(raw, { width: w })} ${w}w`)
    .join(', ');
}

/** Browser helper: synced from public/js/fm-cloudinary.js */
function browserHelperSource() {
  return "(function (w) {\r\n  if (w.fmCloudinary && w.fmCloudinary._v6) return;\r\n\r\n  function cdnBase() {\r\n    return (w.FM_CLOUDINARY_CDN_BASE || '').toString().trim().replace(/\\/$/, '');\r\n  }\r\n  function cdnHost() {\r\n    return (w.FM_CLOUDINARY_CDN || '')\r\n      .toString()\r\n      .trim()\r\n      .toLowerCase()\r\n      .replace(/^https?:\\/\\//, '')\r\n      .replace(/^www\\./, '')\r\n      .replace(/\\/$/, '');\r\n  }\r\n  function esc(s) {\r\n    return String(s).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');\r\n  }\r\n  function normHostPath(s) {\r\n    return String(s || '')\r\n      .trim()\r\n      .replace(/^https?:\\/\\//i, '')\r\n      .replace(/^www\\./i, '')\r\n      .replace(/\\/$/, '')\r\n      .toLowerCase();\r\n  }\r\n\r\n  /* Match res.cloudinary or site /cloudinary/{cloud}/upload paths (www or bare). */\r\n  function isCl(u) {\r\n    u = String(u || '').trim();\r\n    if (!u) return false;\r\n    if (/^(https?:)?\\/\\/res\\.cloudinary\\.com\\/[^/]+\\/(?:image|video|raw)\\/upload\\//i.test(u)) {\r\n      return true;\r\n    }\r\n    // Worker proxy: https://filemakr.com/cloudinary/{cloud}/image/upload/...\r\n    if (/^(https?:)?\\/\\/(?:www\\.)?[^/]+\\/cloudinary\\/[^/]+\\/(?:image|video|raw)\\/upload\\//i.test(u)) {\r\n      return true;\r\n    }\r\n    var b = cdnBase();\r\n    if (b && normHostPath(u).indexOf(normHostPath(b) + '/') === 0) return true;\r\n    var c = cdnHost();\r\n    if (\r\n      c &&\r\n      new RegExp(\r\n        '^(https?:)?\\\\/\\\\/(?:www\\\\.)?' + esc(c) + '\\\\/[^/]+\\\\/(?:image|video|raw)\\\\/upload\\\\/',\r\n        'i'\r\n      ).test(u)\r\n    ) {\r\n      return true;\r\n    }\r\n    return false;\r\n  }\r\n\r\n  function toCdn(u) {\r\n    u = String(u || '').trim();\r\n    if (!/^https?:\\/\\/res\\.cloudinary\\.com\\//i.test(u)) return u;\r\n    var b = cdnBase();\r\n    if (b) return u.replace(/^https?:\\/\\/res\\.cloudinary\\.com/i, b);\r\n    var c = cdnHost();\r\n    if (c) return u.replace(/^https?:\\/\\/res\\.cloudinary\\.com/i, 'https://' + c);\r\n    return u;\r\n  }\r\n\r\n  function hasTx(u) {\r\n    var s = String(u || '');\r\n    var low = s.toLowerCase();\r\n    var m = '/image/upload/';\r\n    if (low.indexOf(m) < 0) {\r\n      if (low.indexOf('/video/upload/') >= 0) m = '/video/upload/';\r\n      else if (low.indexOf('/raw/upload/') >= 0) m = '/raw/upload/';\r\n      else return false;\r\n    }\r\n    var f = s.slice(low.indexOf(m) + m.length).split('/')[0] || '';\r\n    if (!f) return false;\r\n    if (/^v\\d+$/i.test(f)) return false;\r\n    return /[_]|[,]|^(f_|q_|w_|h_|c_|dpr_|e_)/i.test(f);\r\n  }\r\n\r\n  function upQ(u) {\r\n    return String(u || '').replace(\r\n      /(\\/(?:image|video|raw)\\/upload\\/)([^/]*)/i,\r\n      function (full, a, tx) {\r\n        if (!tx || /^v\\d+$/i.test(tx)) return full;\r\n        var parts = tx\r\n          .split(',')\r\n          .map(function (p) {\r\n            return p.trim();\r\n          })\r\n          .filter(Boolean);\r\n        var ch = false;\r\n        parts = parts.map(function (p) {\r\n          if (/^q_auto(?::(?:eco|low))?$/i.test(p)) {\r\n            ch = true;\r\n            return 'q_auto:best';\r\n          }\r\n          return p;\r\n        });\r\n        return ch ? a + parts.join(',') : full;\r\n      }\r\n    );\r\n  }\r\n\r\n  function injectWidth(u, n, sharpen) {\r\n    if (!isFinite(n) || n <= 0) return u;\r\n    return u.replace(/(\\/(?:image|video|raw)\\/upload\\/)([^/]*)(\\/|$)/i, function (_, a, tx, z) {\r\n      var parts;\r\n      if (!tx || /^v\\d+$/i.test(tx)) {\r\n        parts = ['f_auto', 'q_auto:best', 'w_' + n, 'c_limit'];\r\n        if (sharpen) parts.push('e_sharpen:60');\r\n        return a + parts.join(',') + (z === '/' ? '/' : z ? z : '/');\r\n      }\r\n      parts = tx\r\n        .split(',')\r\n        .map(function (p) {\r\n          return p.trim();\r\n        })\r\n        .filter(Boolean)\r\n        .filter(function (p) {\r\n          return !/^w_/i.test(p) && !/^e_sharpen/i.test(p);\r\n        });\r\n      if (!parts.some(function (p) { return /^f_/i.test(p); })) parts.unshift('f_auto');\r\n      if (!parts.some(function (p) { return /^q_/i.test(p); })) parts.push('q_auto:best');\r\n      parts.push('w_' + n);\r\n      if (!parts.some(function (p) { return /^c_/i.test(p); })) parts.push('c_limit');\r\n      if (sharpen) parts.push('e_sharpen:60');\r\n      return a + parts.join(',') + (z || '');\r\n    });\r\n  }\r\n\r\n  function url(u, o) {\r\n    u = String(u || '').trim();\r\n    if (!u || !isCl(u)) return u;\r\n    o = o || {};\r\n    var n = parseInt(o.width, 10);\r\n    var sharpen = o.sharpen !== false && isFinite(n) && n > 0 && n <= 1280;\r\n    if (!hasTx(u)) {\r\n      var p = ['f_auto', 'q_auto:best'];\r\n      if (isFinite(n) && n > 0) {\r\n        p.push('w_' + n);\r\n        p.push('c_limit');\r\n        if (sharpen) p.push('e_sharpen:60');\r\n      }\r\n      u = u.replace(/(\\/(?:image|video|raw)\\/upload\\/)/i, '$1' + p.join(',') + '/');\r\n    } else {\r\n      u = upQ(u);\r\n      if (isFinite(n) && n > 0) u = injectWidth(u, n, sharpen);\r\n    }\r\n    return toCdn(u);\r\n  }\r\n\r\n  function srcSet(u, ws) {\r\n    u = String(u || '').trim();\r\n    if (!u) return '';\r\n    ws = ws && ws.length ? ws : [640, 960, 1280];\r\n    if (!isCl(u)) return u + ' ' + ws[0] + 'w';\r\n    return ws\r\n      .map(function (n) {\r\n        return url(u, { width: n }) + ' ' + n + 'w';\r\n      })\r\n      .join(', ');\r\n  }\r\n\r\n  w.fmCloudinary = { url: url, srcSet: srcSet, toCdn: toCdn, isCl: isCl, _v6: 1 };\r\n})(window);\r\n";
}

module.exports = {
  cloudinaryDisplayUrl,
  cloudinarySrcSet,
  toCloudinaryCdnUrl,
  isCloudinaryUploadUrl,
  hasExistingTransforms,
  upgradeSoftQuality,
  getCdnHost,
  getCdnBase,
  DEFAULT_QUALITY,
  browserHelperSource
};
