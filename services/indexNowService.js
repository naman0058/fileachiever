'use strict';

const axios = require('axios');
const { normalizeSiteOrigin } = require('../utils/canonicalHost');
const { blogCanonicalLoc } = require('./blogSitemapService');

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX_BATCH = 100;
const DEDUPE_MS = Number(process.env.INDEXNOW_DEDUPE_MS) || 6 * 60 * 60 * 1000;
const MAX_RETRIES = Number(process.env.INDEXNOW_MAX_RETRIES) || 2;

const recentByUrl = new Map();
const pendingQueue = [];
let flushTimer = null;

function isEnabled() {
  return process.env.INDEXNOW_ENABLED !== '0' && process.env.INDEXNOW_ENABLED !== 'false';
}

function getKey() {
  return String(process.env.INDEXNOW_KEY || '').trim();
}

function getHost() {
  return String(process.env.INDEXNOW_HOST || 'www.filemakr.com').trim().toLowerCase();
}

function isConfigured() {
  const key = getKey();
  return isEnabled() && key.length >= 8 && key.length <= 128 && /^[a-zA-Z0-9-]+$/.test(key);
}

function getKeyLocation() {
  const origin = normalizeSiteOrigin(process.env.SITE_BASE_URL || 'https://www.filemakr.com').replace(
    /\/$/,
    ''
  );
  return `${origin}/${getKey()}.txt`;
}

function shouldSubmitUrl(url) {
  const last = recentByUrl.get(url);
  if (last && Date.now() - last < DEDUPE_MS) return false;
  return true;
}

function markSubmitted(urls) {
  const now = Date.now();
  for (const u of urls) recentByUrl.set(u, now);
}

async function postIndexNow(urlList) {
  if (!isConfigured() || !urlList.length) return { ok: false, skipped: true };

  const host = getHost();
  const key = getKey();
  const payload = {
    host,
    key,
    keyLocation: getKeyLocation(),
    urlList: urlList.slice(0, MAX_BATCH),
  };

  let attempt = 0;
  let lastErr = null;
  while (attempt <= MAX_RETRIES) {
    try {
      const res = await axios.post(INDEXNOW_ENDPOINT, payload, {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        timeout: 15000,
        validateStatus: (s) => s >= 200 && s < 500,
      });
      if (res.status === 200 || res.status === 202) {
        markSubmitted(urlList);
        return { ok: true, status: res.status };
      }
      lastErr = new Error(`IndexNow HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    attempt += 1;
    if (attempt <= MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  console.warn('[IndexNow] submit failed:', lastErr && lastErr.message ? lastErr.message : lastErr);
  return { ok: false, error: lastErr };
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    const batch = pendingQueue.splice(0, MAX_BATCH);
    if (!batch.length) return;
    await postIndexNow(batch);
    if (pendingQueue.length) scheduleFlush();
  }, 1500);
}

function queueUrls(urls) {
  if (!isConfigured()) return;
  for (const raw of urls || []) {
    const url = String(raw || '').trim();
    if (!url || !shouldSubmitUrl(url)) continue;
    if (!pendingQueue.includes(url)) pendingQueue.push(url);
  }
  if (pendingQueue.length) scheduleFlush();
}

function queueBlogSlug(slug) {
  const loc = blogCanonicalLoc(slug);
  if (loc) queueUrls([loc]);
}

/**
 * Call after publish/update/unpublish of a public blog URL.
 */
function notifyBlogUrlChange(slug, options = {}) {
  if (!isConfigured()) return Promise.resolve({ skipped: true });
  const loc = blogCanonicalLoc(slug);
  if (!loc) return Promise.resolve({ skipped: true });
  if (options.force) {
    recentByUrl.delete(loc);
  }
  queueUrls([loc]);
  if (options.previousSlug && options.previousSlug !== slug) {
    const prev = blogCanonicalLoc(options.previousSlug);
    if (prev && shouldSubmitUrl(prev)) queueUrls([prev]);
  }
  return Promise.resolve({ queued: true });
}

async function submitBlogSlugNow(slug) {
  const loc = blogCanonicalLoc(slug);
  if (!loc) return { ok: false, error: 'invalid_slug' };
  recentByUrl.delete(loc);
  return postIndexNow([loc]);
}

module.exports = {
  isConfigured,
  isEnabled,
  getKey,
  getKeyLocation,
  getHost,
  queueUrls,
  queueBlogSlug,
  notifyBlogUrlChange,
  submitBlogSlugNow,
  postIndexNow,
};
