#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  analyzeBlogListingQuery,
  buildBlogListingCanonical,
  buildBlogListingJsonLd,
  blogListingMetaTags,
  ROBOTS_NOINDEX_FOLLOW,
  ROBOTS_INDEX_FULL,
} = require('../utils/blogListingSeo');

const origin = 'https://www.filemakr.com';

const search = analyzeBlogListingQuery({ q: 'dfd' });
assert.ok(search.isSearch);
assert.ok(search.noindex);
assert.strictEqual(
  buildBlogListingCanonical({ q: 'dfd', cat: '', page: 2, siteOrigin: origin }),
  'https://www.filemakr.com/blog'
);

const sort = analyzeBlogListingQuery({ sort: 'old' });
assert.ok(sort.noindex);
assert.strictEqual(
  buildBlogListingCanonical({ q: '', cat: '', page: 1, siteOrigin: origin }),
  'https://www.filemakr.com/blog'
);

const page2 = buildBlogListingCanonical({ q: '', cat: '', page: 2, siteOrigin: origin });
assert.strictEqual(page2, 'https://www.filemakr.com/blog?page=2');

const metaSearch = blogListingMetaTags('https://www.filemakr.com/blog', search, origin);
assert.strictEqual(metaSearch.robots, ROBOTS_NOINDEX_FOLLOW);
assert.strictEqual(metaSearch.includeMetaKeywords, false);
assert.strictEqual(metaSearch.htmlLang, 'en-US');

const metaIndex = blogListingMetaTags('https://www.filemakr.com/blog', analyzeBlogListingQuery({}), origin);
assert.strictEqual(metaIndex.robots, ROBOTS_INDEX_FULL);

const ld = buildBlogListingJsonLd({
  posts: [{ slug: 'test-post', title: 'Hello World Guide' }],
  canonicalUrl: 'https://www.filemakr.com/blog',
  page: 1,
  siteOrigin: origin,
});
assert.ok(ld['@graph']);
assert.ok(ld['@graph'].some((n) => n['@type'] === 'CollectionPage'));
assert.ok(ld['@graph'].some((n) => n['@type'] === 'ItemList'));
assert.ok(!JSON.stringify(ld).includes('BlogPosting'));

JSON.parse(JSON.stringify(ld));

console.log('blog-listing-seo: OK');
process.exit(0);
