#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  resolveBlogDetailCanonical,
  blogDetailMetaTags,
  buildBlogDetailJsonLd,
  mergeCustomSchemaMarkup,
  blogDetailHeading,
} = require('../utils/blogDetailSeo');

const origin = 'https://www.filemakr.com';
const post = {
  id: 1,
  slug: 'sample-post',
  title: 'Sample Title',
  meta_title: 'SEO Meta Title',
  meta_description: 'A useful description for students.',
  content: '<p>Word '.repeat(50).trim() + '</p>',
  created_at: '2024-06-01T10:00:00.000Z',
  updated_at: '2024-07-01T12:00:00.000Z',
  language_code: 'en-US',
  category: 'explainer-blog',
  tags: 'node, projects',
  focus_keyword: 'final year',
  answer_summary: 'A direct answer about projects for students seeking practical guidance.',
  entities_json: [{ name: 'Node.js', type: 'SoftwareApplication' }],
  schema_markup: JSON.stringify({ '@type': 'FAQPage', mainEntity: [] }),
};

assert.strictEqual(
  resolveBlogDetailCanonical(post, origin),
  `${origin}/blog/sample-post`
);

assert.strictEqual(
  resolveBlogDetailCanonical(
    { slug: 'sample-post', canonical_url: 'https://evil.com/blog/sample-post' },
    origin
  ),
  `${origin}/blog/sample-post`
);

assert.strictEqual(
  resolveBlogDetailCanonical(
    { slug: 'sample-post', canonical_url: 'https://www.filemakr.com/blog/sample-post' },
    origin
  ),
  'https://www.filemakr.com/blog/sample-post'
);

const meta = blogDetailMetaTags(post, `${origin}/blog/sample-post`, origin);
assert.strictEqual(meta.ogType, 'article');
assert.ok(meta.robots.includes('index,follow'));
assert.strictEqual(meta.includeMetaKeywords, false);
assert.ok(meta.articlePublishedTime);
assert.strictEqual(blogDetailHeading(post), 'SEO Meta Title');

const ld = buildBlogDetailJsonLd(post, {
  siteOrigin: origin,
  canonicalUrl: `${origin}/blog/sample-post`,
  authorDisplay: { type: 'person', name: 'Alex Writer' },
});
assert.ok(ld['@graph']);
const posting = ld['@graph'].find((n) => n['@type'] === 'BlogPosting');
assert.ok(posting);
assert.strictEqual(posting.url, `${origin}/blog/sample-post`);
assert.ok(posting.wordCount > 10);
assert.ok(posting.about);
assert.ok(posting.mentions);
assert.strictEqual(posting.author['@type'], 'Person');
assert.ok(!JSON.stringify(ld).includes('FAQPage'));

const merged = mergeCustomSchemaMarkup(ld, JSON.stringify({ '@type': 'HowTo', name: 'Extra' }));
assert.ok(merged['@graph'].some((n) => n['@type'] === 'HowTo'));

JSON.parse(JSON.stringify(ld));

const badEntityPost = {
  ...post,
  entities_json: [
    { name: 'Fake', type: 'Thing', sameAs: 'https://www.example.com/fake' },
    { name: 'Node.js', type: 'SoftwareApplication', sameAs: 'https://nodejs.org/' },
  ],
};
const ldBad = buildBlogDetailJsonLd(badEntityPost, {
  siteOrigin: origin,
  canonicalUrl: `${origin}/blog/sample-post`,
});
const postingBad = ldBad['@graph'].find((n) => n['@type'] === 'BlogPosting');
assert.ok(postingBad.about);
const aboutStr = JSON.stringify(postingBad.about);
assert.ok(!aboutStr.includes('example.com'));
assert.ok(aboutStr.includes('nodejs.org') || aboutStr.includes('Node.js'));

JSON.parse(JSON.stringify(ldBad));

console.log('blog-detail-seo: OK');
process.exit(0);
