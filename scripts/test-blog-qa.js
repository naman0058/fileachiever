#!/usr/bin/env node
'use strict';

/**
 * Release-blocking blog SEO QA (unit tests + placeholder leak scan).
 * Optional live HTML checks: BLOG_QA_BASE_URL=http://localhost:3000 node scripts/test-blog-qa.js
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const root = path.join(__dirname, '..');

const UNIT_SCRIPTS = [
  'test-blog-read-smoke.js',
  'test-blog-listing-seo.js',
  'test-blog-detail-seo.js',
  'test-blog-content-model.js',
  'test-blog-crawl.js',
  'test-blog-adsense.js',
];

const LEAK_PATTERNS = [
  /REPLACE_WITH_/i,
  /YOUR SEO TITLE/i,
  /TODO SEO/i,
  /\blorem ipsum\b/i,
];

const PLACEHOLDER_SCAN_ALLOW = new Set([
  'utils/blogPublic.js', // defensive SQL / title filters
]);

const SCAN_PATHS = [
  'views/blog.ejs',
  'views/blog_details.ejs',
  'views/blog',
  'utils/blogListingSeo.js',
  'utils/blogDetailSeo.js',
  'utils/blogContentModel.js',
  'services/blogReadService.js',
  'services/blogSitemapService.js',
  'services/indexNowService.js',
  'routes/core.js',
  'routes/blogCrawl.js',
  'routes/blog/writer.js',
  'public/robots.txt',
  'public/llms.txt',
];

function collectFiles(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return [];
  const st = fs.statSync(abs);
  if (st.isFile()) return [abs];
  const out = [];
  for (const name of fs.readdirSync(abs)) {
    const p = path.join(abs, name);
    const s = fs.statSync(p);
    if (s.isDirectory()) out.push(...collectFiles(path.relative(root, p)));
    else if (/\.(ejs|js|txt|md)$/i.test(name)) out.push(p);
  }
  return out;
}

function scanPlaceholders() {
  const failures = [];
  const seen = new Set();
  for (const rel of SCAN_PATHS) {
    for (const file of collectFiles(rel)) {
      if (seen.has(file)) continue;
      seen.add(file);
      const relFile = path.relative(root, file).replace(/\\/g, '/');
      if (PLACEHOLDER_SCAN_ALLOW.has(relFile)) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const re of LEAK_PATTERNS) {
        if (re.test(text)) {
          failures.push(`${path.relative(root, file)} matches ${re}`);
        }
      }
    }
  }
  return failures;
}

function fetchHtml(urlPath, base) {
  const url = new URL(base.replace(/\/$/, '') + urlPath);
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode, html: Buffer.concat(chunks).toString('utf8') })
      );
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
  });
}

async function liveChecks(base) {
  const failures = [];
  const list = await fetchHtml('/blog', base);
  if (list.status !== 200) failures.push(`/blog HTTP ${list.status}`);
  const h1Count = (list.html.match(/<h1[\s>]/gi) || []).length;
  if (h1Count !== 1) failures.push(`/blog expected 1 H1, found ${h1Count}`);
  if (!list.html.includes('rel="canonical"')) failures.push('/blog missing canonical');
  if (!/index,follow/i.test(list.html)) failures.push('/blog missing index,follow');

  const search = await fetchHtml('/blog?q=test', base);
  if (search.status !== 200) failures.push('/blog?q=test HTTP ' + search.status);
  if (!/noindex,follow/i.test(search.html)) failures.push('/blog?q=test missing noindex,follow');
  const canonSearch = search.html.match(/rel="canonical"\s+href="([^"]+)"/i);
  if (!canonSearch || !/\/blog\/?$/i.test(canonSearch[1].replace(/\/$/, ''))) {
    failures.push(`/blog?q=test canonical must be /blog (got ${canonSearch && canonSearch[1]})`);
  }

  const slugMatch = list.html.match(/href="\/blog\/([^"?#/]+)"/i);
  const slug = process.env.BLOG_QA_DETAIL_SLUG || (slugMatch ? decodeURIComponent(slugMatch[1]) : null);
  if (slug) {
    const detail = await fetchHtml(`/blog/${encodeURIComponent(slug)}`, base);
    if (detail.status !== 200) failures.push(`/blog/${slug} HTTP ${detail.status}`);
    const ldCount = (detail.html.match(/application\/ld\+json/gi) || []).length;
    if (ldCount !== 1) failures.push(`/blog/${slug} expected 1 JSON-LD block, found ${ldCount}`);
    if (!detail.html.includes('BlogPosting') && !detail.html.includes('"@type":"BlogPosting"')) {
      failures.push(`/blog/${slug} missing BlogPosting in JSON-LD`);
    }
    if (!detail.html.includes('BreadcrumbList')) {
      failures.push(`/blog/${slug} missing BreadcrumbList in JSON-LD`);
    }
    if (!detail.html.includes('bd-content') && !detail.html.includes('entry-content')) {
      failures.push(`/blog/${slug} missing article body container`);
    }
  }

  const missing = await fetchHtml('/blog/__qa_missing_slug__', base);
  if (missing.status !== 404) failures.push(`missing slug expected 404, got ${missing.status}`);

  return failures;
}

async function main() {
  const failures = [];

  for (const script of UNIT_SCRIPTS) {
    const r = spawnSync(process.execPath, [path.join(__dirname, script)], {
      cwd: root,
      encoding: 'utf8',
      timeout: 120000,
    });
    if (r.status !== 0) {
      failures.push(`${script} failed:\n${r.stdout || ''}${r.stderr || ''}`);
    }
  }

  failures.push(...scanPlaceholders());

  const base = process.env.BLOG_QA_BASE_URL;
  if (base) {
    try {
      failures.push(...(await liveChecks(base)));
    } catch (err) {
      failures.push(`live checks: ${err.message}`);
    }
  }

  if (failures.length) {
    console.error('blog-qa: FAIL');
    failures.forEach((f) => console.error(' -', f));
    process.exit(1);
  }
  console.log('blog-qa: OK');
  if (!base) {
    console.log('(Set BLOG_QA_BASE_URL for live HTML checks)');
  }
}

main();
