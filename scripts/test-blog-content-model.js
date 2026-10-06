#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  validateBlogContentPayload,
  hydrateBlogContentFields,
  serializeBlogPostPublic,
} = require('../utils/blogContentModel');

const ok = validateBlogContentPayload({});
assert.ok(ok.ok);
assert.strictEqual(ok.data.language_code, 'en-US');
assert.strictEqual(ok.data.target_country, 'US');

const badSummary = validateBlogContentPayload({ answer_summary: 'Too short.' });
assert.ok(!badSummary.ok);

const goodSummary = validateBlogContentPayload({
  answer_summary:
    'A final-year project report documents problem statement, methodology, implementation, testing, and conclusions in a format evaluators expect. Students should align chapters with their university guide and keep diagrams and references consistent throughout.',
});
assert.ok(goodSummary.ok);

const takeaways = validateBlogContentPayload({
  key_takeaways: 'One\nTwo\nThree\nFour',
});
assert.ok(takeaways.ok);
assert.strictEqual(takeaways.data.key_takeaways.length, 4);

const entities = validateBlogContentPayload({
  entities_json: JSON.stringify([
    { name: 'Node.js', type: 'SoftwareApplication' },
  ]),
});
assert.ok(entities.ok);

const fakeSameAs = validateBlogContentPayload({
  entities_json: JSON.stringify([
    { name: 'X', type: 'Thing', sameAs: 'not-a-url' },
  ]),
});
assert.ok(!fakeSameAs.ok);

const exampleSameAs = validateBlogContentPayload({
  entities_json: JSON.stringify([
    { name: 'X', type: 'Thing', sameAs: 'https://www.example.com/page' },
  ]),
});
assert.ok(!exampleSameAs.ok);

const row = hydrateBlogContentFields({
  id: 1,
  key_takeaways: '["a","b","c"]',
  entities_json: null,
});
assert.deepStrictEqual(row.key_takeaways, ['a', 'b', 'c']);

const pub = serializeBlogPostPublic({ id: 2, slug: 'x', title: 'T', key_takeaways: ['a', 'b', 'c'] });
assert.ok(Array.isArray(pub.key_takeaways));
assert.strictEqual(pub.entities, null);

console.log('blog-content-model: OK');
process.exit(0);
