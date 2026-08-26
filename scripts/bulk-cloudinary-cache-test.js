'use strict';
/**
 * Bulk Cloudflare Cloudinary-proxy cache test.
 * Writes NDJSON to debug-4f411d.log for debug session 4f411d.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const LOG = path.join(__dirname, 'debug-4f411d.log');
const SESSION = '4f411d';

function log(hypothesisId, location, message, data, runId) {
  const line = JSON.stringify({
    sessionId: SESSION,
    hypothesisId,
    location,
    message,
    data,
    runId: runId || 'bulk-cache',
    timestamp: Date.now()
  });
  fs.appendFileSync(LOG, line + '\n');
  // also try ingest (may be local-only)
  fetch('http://127.0.0.1:7553/ingest/5e627038-7de4-44a6-86b3-8358f91be853', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': SESSION
    },
    body: line
  }).catch(() => {});
}

function head(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(
      url,
      { method: 'HEAD', timeout: 25000, headers: { 'User-Agent': 'FileMakr-BulkCacheTest/1.0' } },
      (res) => {
        // follow one redirect
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          return head(next).then(resolve);
        }
        const h = res.headers;
        resolve({
          status: res.statusCode,
          fmCache: h['x-fm-cache'] || '',
          fmOrigin: h['x-fm-origin'] || '',
          fmProxy: h['x-fm-proxy'] || '',
          cfCache: h['cf-cache-status'] || '',
          cacheControl: h['cache-control'] || '',
          cdnCache: h['cdn-cache-control'] || '',
          vary: h['vary'] || ''
        });
        res.resume();
      }
    );
    req.on('error', (e) => resolve({ status: 0, error: String(e.message || e) }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, error: 'timeout' });
    });
    req.end();
  });
}

function get(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(
      url,
      { method: 'GET', timeout: 40000, headers: { 'User-Agent': 'FileMakr-BulkCacheTest/1.0' } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          return get(next).then(resolve);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: res.headers
          });
        });
      }
    );
    req.on('error', (e) => resolve({ status: 0, error: String(e.message || e), body: '' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, error: 'timeout', body: '' });
    });
    req.end();
  });
}

function toProxy(resUrl) {
  return resUrl.replace(
    /^https?:\/\/res\.cloudinary\.com/i,
    'https://www.filemakr.com/cloudinary'
  );
}

async function main() {
  // --- H3: production HTML still using res.cloudinary.com? ---
  const home = await get('https://www.filemakr.com/');
  const sc = await get('https://www.filemakr.com/source-code');
  const homeBody = home.body || '';
  const scBody = sc.body || '';
  const count = (s, re) => (s.match(re) || []).length;
  log('H3', 'bulk-cache-test.js:home', 'production homepage image hosts', {
    status: home.status,
    resCloudinary: count(homeBody, /res\.cloudinary\.com/g),
    filemakrProxy: count(homeBody, /filemakr\.com\/cloudinary/g),
    hasFmCdnBase: /FM_CLOUDINARY_CDN_BASE/.test(homeBody)
  });
  log('H3', 'bulk-cache-test.js:source-code', 'production source-code image hosts', {
    status: sc.status,
    resCloudinary: count(scBody, /res\.cloudinary\.com/g),
    filemakrProxy: count(scBody, /filemakr\.com\/cloudinary/g),
    hasFmCdnBase: /FM_CLOUDINARY_CDN_BASE/.test(scBody)
  });

  // Build large unique URL set (different widths = different cache keys)
  const bases = [
    'https://res.cloudinary.com/dggf8vl9p/image/upload/v1718627756/filemakr-project-file-creator-favicon_1_dqogst.avif',
    'https://res.cloudinary.com/dggf8vl9p/image/upload/facebook_vjgbfw.avif',
    'https://res.cloudinary.com/dggf8vl9p/image/upload/instagram_l8dmnm.avif',
    'https://res.cloudinary.com/dggf8vl9p/image/upload/linkedin_wslaqg.avif',
    'https://res.cloudinary.com/zbuzl6te/image/upload/v1787209092/ChatGPT_Image_Aug_20_2026_12_27_40_PM.webp'
  ];
  const widths = [48, 64, 96, 128, 160, 200, 240, 280, 320, 360, 400, 480, 560, 640, 720, 800, 960];
  const urls = [];
  for (const b of bases) {
    // raw (f_auto,q_auto:best only via path inject style used by site)
    const pathPart = b.replace(/^https?:\/\/res\.cloudinary\.com/i, '');
    for (const w of widths) {
      const u =
        'https://www.filemakr.com/cloudinary' +
        pathPart.replace(
          '/image/upload/',
          `/image/upload/f_auto,q_auto:best,w_${w},c_limit/`
        );
      urls.push(u);
    }
  }
  // dedupe
  const unique = [...new Set(urls)];
  log('H2', 'bulk-cache-test.js:plan', 'unique proxy URLs planned', {
    count: unique.length
  });

  const summary = {
    round1OriginHits: 0,
    round1CacheHits: 0,
    round1Errors: 0,
    round2OriginHits: 0,
    round2CacheHits: 0,
    round2Errors: 0,
    badCdnNoStore: 0,
    samples: []
  };

  async function round(name, roundNum) {
    for (let i = 0; i < unique.length; i++) {
      const u = unique[i];
      const r = await head(u);
      const originHit = r.fmOrigin === '1';
      const cacheHit = r.fmCache === 'HIT';
      if (r.status !== 200) summary[roundNum === 1 ? 'round1Errors' : 'round2Errors']++;
      else if (originHit) summary[roundNum === 1 ? 'round1OriginHits' : 'round2OriginHits']++;
      else if (cacheHit || r.fmOrigin === '0')
        summary[roundNum === 1 ? 'round1CacheHits' : 'round2CacheHits']++;
      if ((r.cdnCache || '').includes('no-store')) summary.badCdnNoStore++;

      if (i < 5 || i % 20 === 0 || originHit && roundNum === 2) {
        summary.samples.push({ round: roundNum, i, ...r, urlTail: u.slice(-80) });
      }

      log(roundNum === 1 ? 'H1' : 'H1', `bulk-cache-test.js:${name}`, 'head result', {
        i,
        status: r.status,
        fmCache: r.fmCache,
        fmOrigin: r.fmOrigin,
        fmProxy: r.fmProxy,
        cfCache: r.cfCache,
        cdnCache: r.cdnCache,
        vary: r.vary,
        error: r.error || null,
        urlTail: u.slice(-90)
      });
    }
  }

  console.log('Round 1 (expect mostly MISS / Origin 1)...', unique.length);
  await round('round1', 1);
  console.log('Round 2 (expect HIT / Origin 0)...');
  await round('round2', 2);

  // H5 www vs non-www
  const one =
    'https://www.filemakr.com/cloudinary/dggf8vl9p/image/upload/f_auto,q_auto:best,w_111,c_limit/v1718627756/filemakr-project-file-creator-favicon_1_dqogst.avif';
  const nonWww = one.replace('https://www.', 'https://');
  const a = await head(one);
  const b = await head(nonWww);
  log('H5', 'bulk-cache-test.js:www-share', 'www then non-www', { www: a, nonWww: b });

  log('SUMMARY', 'bulk-cache-test.js:summary', 'bulk cache summary', summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  log('ERR', 'bulk-cache-test.js', String(e && e.stack || e), {});
  console.error(e);
  process.exit(1);
});
