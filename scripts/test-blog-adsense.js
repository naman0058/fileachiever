#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  countArticleWords,
  getBlogAdPlacements,
  injectBlogContentAdMarkers,
} = require('../utils/blogArticleAds');
const { getAdsenseConfig } = require('../utils/adsenseConfig');

process.env.ADSENSE_CLIENT_ID = 'ca-pub-7230981653683251';
process.env.ADSENSE_ENABLED = '1';
process.env.ADSENSE_SLOT_BLOG_DISPLAY = '1234567890';

const cfg = getAdsenseConfig();
assert.strictEqual(cfg.clientId, 'ca-pub-7230981653683251');
assert.ok(cfg.adsTxtLine.includes('pub-7230981653683251'));

const short = getBlogAdPlacements(350);
assert.strictEqual(short.mid_content_1, false);
assert.strictEqual(short.mid_content_2, false);

const medium = getBlogAdPlacements(1000);
assert.strictEqual(medium.mid_content_1, true);
assert.strictEqual(medium.mid_content_2, false);

const long = getBlogAdPlacements(2000);
assert.ok(long.mid_content_1 && long.mid_content_2 && long.end_content);

const sample =
  '<p>' +
  'word '.repeat(200) +
  '</p><h2>Section</h2><p>' +
  'word '.repeat(200) +
  '</p><ul><li>a</li><li>b</li></ul><p>' +
  'word '.repeat(600) +
  '</p>';
const injected = injectBlogContentAdMarkers(sample, countArticleWords(sample));
assert.ok(injected.includes('data-fm-ad-mount'));
assert.ok(!injected.includes('<ul><div class="fm-blog-ad-mount'));

console.log('test-blog-adsense: OK');
process.exit(0);
