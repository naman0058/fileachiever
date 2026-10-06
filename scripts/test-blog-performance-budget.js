#!/usr/bin/env node
'use strict';

/**
 * CI-friendly smoke checks for blog HTML performance budgets (server must be running).
 * Exit 1 when budgets exceeded.
 */

const http = require('http');
const https = require('https');

const base = (process.env.BLOG_PERF_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const BUDGET = {
  listingTtfbMs: Number(process.env.BLOG_BUDGET_LIST_TTFB_MS) || 2500,
  detailTtfbMs: Number(process.env.BLOG_BUDGET_DETAIL_TTFB_MS) || 3000,
  listingMaxKiB: Number(process.env.BLOG_BUDGET_LIST_KIB) || 180,
  detailMaxKiB: Number(process.env.BLOG_BUDGET_DETAIL_KIB) || 350,
};

function fetchPath(path) {
  const url = new URL(base + path);
  const lib = url.protocol === 'https:' ? https : http;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const req = lib.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          path,
          status: res.statusCode,
          ttfbMs: Date.now() - start,
          bytes: chunks.reduce((n, c) => n + c.length, 0),
          cacheControl: res.headers['cache-control'] || '',
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
  });
}

function fetchHtml(path) {
  const url = new URL(base + path);
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
  });
}

async function main() {
  const failures = [];

  const list = await fetchPath('/blog');
  if (list.status !== 200) failures.push(`/blog status ${list.status}`);
  if (list.ttfbMs > BUDGET.listingTtfbMs) {
    failures.push(`/blog TTFB ${list.ttfbMs}ms > ${BUDGET.listingTtfbMs}ms`);
  }
  if (list.bytes / 1024 > BUDGET.listingMaxKiB) {
    failures.push(`/blog size ${(list.bytes / 1024).toFixed(1)} KiB > ${BUDGET.listingMaxKiB} KiB`);
  }
  if (!/public,\s*max-age=/i.test(list.cacheControl)) {
    failures.push('/blog missing public Cache-Control');
  }

  const html = await fetchHtml('/blog');
  const slugMatch = html.match(/href="\/blog\/([^"?#/]+)"/i);
  const slug = process.env.BLOG_PERF_DETAIL_SLUG || (slugMatch ? decodeURIComponent(slugMatch[1]) : null);

  if (slug) {
    const detail = await fetchPath(`/blog/${encodeURIComponent(slug)}`);
    if (detail.status !== 200) failures.push(`/blog/${slug} status ${detail.status}`);
    if (detail.ttfbMs > BUDGET.detailTtfbMs) {
      failures.push(`/blog/${slug} TTFB ${detail.ttfbMs}ms > ${BUDGET.detailTtfbMs}ms`);
    }
    if (detail.bytes / 1024 > BUDGET.detailMaxKiB) {
      failures.push(
        `/blog/${slug} size ${(detail.bytes / 1024).toFixed(1)} KiB > ${BUDGET.detailMaxKiB} KiB`
      );
    }
  } else {
    failures.push('Could not detect a blog slug for detail budget check');
  }

  const search = await fetchPath('/blog?q=test');
  if (search.status !== 200) failures.push('/blog?q=test status ' + search.status);

  if (failures.length) {
    console.error('blog-performance-budget: FAIL');
    failures.forEach((f) => console.error(' -', f));
    process.exit(1);
  }
  console.log('blog-performance-budget: OK');
}

main().catch((err) => {
  console.error('blog-performance-budget: ERROR', err.message);
  process.exit(1);
});
