#!/usr/bin/env node
'use strict';

/**
 * Quick TTFB/size checks for blog routes (app must be running).
 * Usage: node scripts/measure-blog-performance.js [baseUrl]
 * Env: BLOG_PERF_DETAIL_SLUG — optional slug for /blog/:slug (auto-detected from listing when omitted)
 */

const http = require('http');
const https = require('https');

const base = (process.argv[2] || process.env.BLOG_PERF_BASE_URL || 'http://localhost:3000').replace(
  /\/$/,
  ''
);

async function fetchFull(path) {
  const url = new URL(base + path);
  const lib = url.protocol === 'https:' ? https : http;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const req = lib.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          path,
          status: res.statusCode,
          ttfbMs: Date.now() - start,
          bytes: body.length,
          body: body.toString('utf8'),
          cacheControl: res.headers['cache-control'] || '',
          contentType: res.headers['content-type'] || '',
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

function extractFirstBlogSlug(html) {
  const m = html.match(/href="\/blog\/([^"?#/]+)"/i);
  return m ? decodeURIComponent(m[1]) : null;
}

function countMatches(str, re) {
  const g = str.match(re);
  return g ? g.length : 0;
}

async function main() {
  console.log('Blog performance probe — base:', base);

  const listing = await fetchFull('/blog');
  console.log(
    `/blog → ${listing.status} | ${listing.ttfbMs}ms | ${(listing.bytes / 1024).toFixed(1)} KiB | cache: ${listing.cacheControl || '-'}`
  );

  const slug =
    process.env.BLOG_PERF_DETAIL_SLUG ||
    extractFirstBlogSlug(listing.body) ||
    null;

  const paths = [
    '/blog?q=test',
    '/blog/__perf_missing_slug_404__',
  ];
  if (slug) {
    paths.unshift(`/blog/${encodeURIComponent(slug)}`);
  }

  for (const path of paths) {
    try {
      const r = await fetchFull(path);
      const extra =
        path.startsWith('/blog/') && !path.includes('__perf_missing')
          ? ` | canonical: ${/rel="canonical"/i.test(r.body)} | article: ${/itemprop="headline"/i.test(r.body)} | jsonld: ${countMatches(r.body, /application\/ld\+json/g)}`
          : path.includes('__perf_missing')
            ? ` | 404-ish: ${r.status === 404 || /not found/i.test(r.body)}`
            : ` | noindex: ${/noindex/i.test(r.body)}`;
      console.log(
        `${path} → ${r.status} | ${r.ttfbMs}ms | ${(r.bytes / 1024).toFixed(1)} KiB | cache: ${r.cacheControl || '-'}${extra}`
      );
    } catch (err) {
      console.log(`${path} → ERROR: ${err.message}`);
    }
  }

  const leanOk = !/"content"\s*:\s*"<p/i.test(listing.body.slice(0, 50000));
  console.log(`\nListing lean (no embedded JSON content blob in first 50k): ${leanOk ? 'OK' : 'CHECK'}`);
  console.log('For Lighthouse, see docs/blog-performance.md');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
