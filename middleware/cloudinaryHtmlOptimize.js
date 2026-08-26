'use strict';

/**
 * Rewrite ALL res.cloudinary.com delivery URLs in HTML responses to the Worker CDN
 * proxy (and inject f_auto/q_auto when missing). Covers img/srcset/href, CSS, meta,
 * and JSON catalogs inside <script> so JS-rendered grids also use the proxy.
 *
 * Skips binary download payloads (PDF/DOCX). Word/PDF builders fetch originals
 * server-side from API bodies (not from this HTML rewriter).
 */

const {
  cloudinaryDisplayUrl,
  toCloudinaryCdnUrl,
  isCloudinaryUploadUrl,
  hasExistingTransforms,
  upgradeSoftQuality,
  getCdnBase,
  getCdnHost
} = require('../utils/cloudinaryDisplay');

function stripTrailingPunct(url) {
  const m = String(url || '').match(/^(.*?)([),.;]+)?$/);
  return { clean: (m && m[1]) || url, trail: (m && m[2]) || '' };
}

/** Add f_auto,q_auto:best when missing; upgrade soft q_auto; then CDN proxy. */
function ensureDisplayCloudinaryUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return raw;
  if (!/^https?:\/\/res\.cloudinary\.com\//i.test(raw) && !isCloudinaryUploadUrl(raw)) {
    return raw;
  }

  if (!hasExistingTransforms(raw)) {
    return cloudinaryDisplayUrl(raw, {});
  }

  const lower = raw.toLowerCase();
  let marker = '/image/upload/';
  if (!lower.includes(marker)) {
    if (lower.includes('/video/upload/')) marker = '/video/upload/';
    else if (lower.includes('/raw/upload/')) marker = '/raw/upload/';
    else return toCloudinaryCdnUrl(upgradeSoftQuality(raw));
  }
  const idx = lower.indexOf(marker);
  const prefix = raw.slice(0, idx + marker.length);
  const rest = raw.slice(idx + marker.length);
  const slash = rest.indexOf('/');
  const first = slash >= 0 ? rest.slice(0, slash) : rest;
  const after = slash >= 0 ? rest.slice(slash) : '';
  if (/^v\d+$/i.test(first)) {
    return cloudinaryDisplayUrl(raw, {});
  }
  const parts = first.split(',').map((p) => p.trim()).filter(Boolean);
  const hasF = parts.some((p) => /^f_/i.test(p));
  let hasQ = parts.some((p) => /^q_/i.test(p));
  const nextParts = parts.map((p) => {
    if (/^q_auto(?::(?:eco|low))?$/i.test(p)) {
      hasQ = true;
      return 'q_auto:best';
    }
    return p;
  });
  const inject = [];
  if (!hasF) inject.push('f_auto');
  if (!hasQ) inject.push('q_auto:best');
  const next = prefix + inject.concat(nextParts).join(',') + after;
  return toCloudinaryCdnUrl(next);
}

function optimizeUrlMatch(url) {
  const { clean, trail } = stripTrailingPunct(url);
  if (!/^https?:\/\/res\.cloudinary\.com\//i.test(clean)) return url;
  return ensureDisplayCloudinaryUrl(clean) + trail;
}

function optimizeSrcSet(value) {
  return String(value || '')
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return trimmed;
      const bits = trimmed.split(/\s+/);
      const u = bits[0];
      const rest = bits.slice(1).join(' ');
      const next = optimizeUrlMatch(u);
      return rest ? `${next} ${rest}` : next;
    })
    .join(', ');
}

/**
 * Global replace of every res.cloudinary.com URL in the HTML document.
 * Also handles JSON-escaped slashes: https:\/\/res.cloudinary.com\/...
 */
function rewriteAllResCloudinaryUrls(html) {
  // Plain URLs
  let out = html.replace(
    /https?:\/\/res\.cloudinary\.com\/[^\s"'<>\\]+/gi,
    (url) => optimizeUrlMatch(url)
  );

  // JSON-escaped URLs inside script string literals
  out = out.replace(
    /https?:\\\/\\\/res\.cloudinary\.com\\\/[^\s"'<>]+/gi,
    (escaped) => {
      const plain = escaped.replace(/\\\//g, '/');
      const next = optimizeUrlMatch(plain);
      return next.replace(/\//g, '\\/');
    }
  );

  return out;
}

function optimizeCloudinaryInHtml(html) {
  if (!html || typeof html !== 'string') return html;
  if (!/res\.cloudinary\.com/i.test(html)) return html;

  // If neither Worker base nor CNAME host is configured, still inject f_auto/q_auto
  // on attributes only (no host rewrite).
  const hasProxy = !!(getCdnBase() || getCdnHost());

  let out = html;

  // Attribute-level (always — for f_auto/q_auto)
  out = out.replace(
    /\b(src|href|data-src)=(["'])(https?:\/\/res\.cloudinary\.com\/[^"']+)\2/gi,
    (full, attr, quote, url) => `${attr}=${quote}${optimizeUrlMatch(url)}${quote}`
  );

  out = out.replace(/\bsrcset=(["'])([^"']*)\1/gi, (full, quote, value) => {
    if (!/res\.cloudinary\.com/i.test(value)) return full;
    return `srcset=${quote}${optimizeSrcSet(value)}${quote}`;
  });

  out = out.replace(
    /url\(\s*(['"]?)(https?:\/\/res\.cloudinary\.com\/[^)"']+)\1\s*\)/gi,
    (full, q, url) => `url(${q || ''}${optimizeUrlMatch(url)}${q || ''})`
  );

  out = out.replace(
    /\bcontent=(["'])(https?:\/\/res\.cloudinary\.com\/[^"']+)\1/gi,
    (full, quote, url) => `content=${quote}${optimizeUrlMatch(url)}${quote}`
  );

  // Full-document rewrite so <script> catalogs / JSON-LD also use the Worker proxy
  if (hasProxy) {
    out = rewriteAllResCloudinaryUrls(out);
  }

  return out;
}

function createCloudinaryHtmlOptimizeMiddleware() {
  return function cloudinaryHtmlOptimizeMiddleware(req, res, next) {
    const originalSend = res.send.bind(res);
    res.send = function sendWithCloudinaryOptimize(body) {
      try {
        const ct = String(res.getHeader('Content-Type') || '');
        const disp = String(res.getHeader('Content-Disposition') || '');

        if (
          ct.includes('application/octet-stream') ||
          ct.includes('application/pdf') ||
          ct.includes('application/vnd') ||
          ct.includes('application/zip') ||
          /attachment/i.test(disp) ||
          Buffer.isBuffer(body)
        ) {
          return originalSend(body);
        }

        const isHtml =
          ct.includes('text/html') ||
          (typeof body === 'string' &&
            !ct &&
            /^\s*</.test(body) &&
            /<html|<head|<body|<img|<link|<script/i.test(body));

        if (isHtml && typeof body === 'string') {
          body = optimizeCloudinaryInHtml(body);
        }
      } catch (_) { /* keep original body */ }
      return originalSend(body);
    };
    next();
  };
}

module.exports = {
  createCloudinaryHtmlOptimizeMiddleware,
  optimizeCloudinaryInHtml,
  ensureDisplayCloudinaryUrl
};
