#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  escapeXml,
  buildBlogSitemapXml,
  buildBlogRssXml,
  blogCanonicalLoc,
} = require('../services/blogSitemapService');
const indexNow = require('../services/indexNowService');

const robots = fs.readFileSync(path.join(__dirname, '..', 'public', 'robots.txt'), 'utf8');
assert.ok(robots.includes('OAI-SearchBot'));
assert.ok(robots.includes('Allow: /'));
assert.ok(robots.includes('PerplexityBot'));
assert.ok(robots.includes('Sitemap: https://www.filemakr.com/sitemap.xml'));
assert.ok(robots.includes('blog-sitemap.xml'));
assert.ok(robots.includes('Disallow: /blog-writer/'));
assert.ok(!robots.match(/Disallow:\s*\/blog\?/));

const entries = [
  {
    loc: 'https://www.filemakr.com/blog/hello-world',
    lastmod: '2024-06-01',
    row: {
      slug: 'hello-world',
      title: 'Hello',
      meta_description: 'Desc',
      created_at: '2024-06-01T00:00:00.000Z',
    },
  },
];

const xml = buildBlogSitemapXml(entries);
assert.ok(xml.includes('&lt;') === false);
assert.ok(xml.includes('<loc>https://www.filemakr.com/blog/hello-world</loc>'));
assert.ok(!xml.includes('?q='));

const escaped = escapeXml('Tom & Jerry');
assert.strictEqual(escaped, 'Tom &amp; Jerry');

const rss = buildBlogRssXml(entries);
assert.ok(rss.includes('<rss version="2.0"'));

const loc = blogCanonicalLoc('my-post');
assert.ok(loc.endsWith('/blog/my-post'));

assert.strictEqual(indexNow.isConfigured(), false);

console.log('blog-crawl: OK');
process.exit(0);
