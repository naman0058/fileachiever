#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const {
  countArticleWords,
  getBlogAdPlacements,
  injectBlogContentAdMarkers,
} = require('../utils/blogArticleAds');
const { getAdsenseConfig, normalizeSlotId } = require('../utils/adsenseConfig');

function freshEnv(overrides) {
  const keys = Object.keys(process.env).filter((k) => k.startsWith('ADSENSE_'));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, {
    NODE_ENV: 'test',
    ADSENSE_CLIENT_ID: 'ca-pub-7230981653683251',
    ADSENSE_ENABLED: '1',
    ...overrides,
  });
}

assert.strictEqual(normalizeSlotId('PASTE_SLOT_ID_HERE'), null);
assert.strictEqual(normalizeSlotId('1234567890'), '1234567890');

freshEnv({ ADSENSE_SLOT_BLOG_DISPLAY: '1234567890' });
let cfg = getAdsenseConfig();
assert.strictEqual(cfg.clientId, 'ca-pub-7230981653683251');
assert.ok(cfg.verifySnippet);
assert.ok(cfg.showAdUnits);
assert.ok(cfg.adsTxtLine.includes('pub-7230981653683251'));

freshEnv({
  ADSENSE_SLOT_BLOG_AFTER_INTRO: '1111111111',
  ADSENSE_SLOT_BLOG_MID_1: '2222222222',
  ADSENSE_SLOT_BLOG_MID_2: '3333333333',
  ADSENSE_SLOT_BLOG_END: '4444444444',
  ADSENSE_SLOT_BLOG_LISTING_1: '5555555555',
});
cfg = getAdsenseConfig();
assert.ok(cfg.showAdUnits);
assert.strictEqual(cfg.slots.after_intro, '1111111111');
assert.strictEqual(cfg.slots.listing_1, '5555555555');

freshEnv({
  ADSENSE_SLOT_BLOG_AFTER_INTRO: 'PASTE_SLOT_ID_HERE',
  ADSENSE_ENABLED: '1',
});
cfg = getAdsenseConfig();
assert.strictEqual(cfg.showAdUnits, false);

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

const faqArticle =
  '<p>' +
  'word '.repeat(1200) +
  '</p><h2>FAQ</h2><h3>Question one?</h3><p>Answer text here.</p><h3>Question two?</h3><p>More answer.</p><h2>Conclusion</h2><p>End words.</p>';
const faqInjected = injectBlogContentAdMarkers(faqArticle, countArticleWords(faqArticle));
const faqIdx = faqInjected.indexOf('<h2>FAQ</h2>');
const mountAfterFaq = faqInjected.indexOf('data-fm-ad-mount', faqIdx);
assert.strictEqual(mountAfterFaq, -1, 'mid-content ad must not appear inside FAQ region');

freshEnv({
  ADSENSE_SLOT_BLOG_AFTER_INTRO: '9876543210',
  ADSENSE_SLOT_BLOG_END: '9876543210',
});
cfg = getAdsenseConfig();
const partialPath = path.join(__dirname, '../views/partials/blog-ad-slot.ejs');
const partialHtml = ejs.render(
  fs.readFileSync(partialPath, 'utf8'),
  {
    fmAdsense: cfg,
    adPosition: 'after_intro',
    blogAdPlacements: getBlogAdPlacements(1500),
  },
  { filename: partialPath }
);
assert.ok(partialHtml.includes('class="adsbygoogle"'));
assert.ok(partialHtml.includes('data-ad-client="ca-pub-7230981653683251"'));
assert.ok(partialHtml.includes('data-ad-slot="9876543210"'));

console.log('test-blog-adsense: OK');
process.exit(0);
