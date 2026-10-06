#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { getAdsenseConfig } = require('../utils/adsenseConfig');
const {
  getBlogAdPlacements,
  injectBlogContentAdMarkers,
  countArticleWords,
} = require('../utils/blogArticleAds');

const SLOTS = {
  after_intro: '7897282174',
  mid_content_1: '9513616179',
  mid_content_2: '5265406099',
  end_content: '3040452021',
  listing_1: '2032738097',
  listing_2: '6788125346',
  display: '8012832244',
};

process.env.ADSENSE_ENABLED = '1';
process.env.ADSENSE_CLIENT_ID = 'ca-pub-7230981653683251';
process.env.ADSENSE_SLOT_BLOG_AFTER_INTRO = SLOTS.after_intro;
process.env.ADSENSE_SLOT_BLOG_MID_1 = SLOTS.mid_content_1;
process.env.ADSENSE_SLOT_BLOG_MID_2 = SLOTS.mid_content_2;
process.env.ADSENSE_SLOT_BLOG_END = SLOTS.end_content;
process.env.ADSENSE_SLOT_BLOG_LISTING_1 = SLOTS.listing_1;
process.env.ADSENSE_SLOT_BLOG_LISTING_2 = SLOTS.listing_2;
process.env.ADSENSE_SLOT_BLOG_DISPLAY = SLOTS.display;

const cfg = getAdsenseConfig();
assert.strictEqual(cfg.slots.after_intro, SLOTS.after_intro);
assert.strictEqual(cfg.slots.mid_content_1, SLOTS.mid_content_1);
assert.strictEqual(cfg.slots.mid_content_2, SLOTS.mid_content_2);
assert.strictEqual(cfg.slots.end_content, SLOTS.end_content);

const articleHtml = fs.readFileSync(
  path.join(__dirname, 'content/data-science-capstone-article.html'),
  'utf8'
);
const wc = countArticleWords(articleHtml);
assert.ok(wc >= 1600, `expected 1600+ words, got ${wc}`);

const placements1600 = getBlogAdPlacements(wc);
assert.strictEqual(placements1600.after_intro, true);
assert.strictEqual(placements1600.mid_content_1, true);
assert.strictEqual(placements1600.mid_content_2, true);
assert.strictEqual(placements1600.end_content, true);

const views = path.join(__dirname, '../views');
const partialPath = path.join(views, 'partials/blog-ad-slot.ejs');
const renderSlot = (locals) =>
  ejs.render(fs.readFileSync(partialPath, 'utf8'), locals, { filename: partialPath, views: [views] });

function renderDetailSlot(adPosition) {
  const tpl = `<%- include('partials/blog-ad-slot', { adPosition: '${adPosition}' }) %>`;
  return ejs.render(
    tpl,
    { fmAdsense: cfg, blogAdPlacements: placements1600 },
    { filename: path.join(views, '_fixture_blog_details.ejs'), views: [views] }
  );
}

const afterHtml = renderDetailSlot('after_intro');
const endHtml = renderDetailSlot('end_content');
assert.ok(afterHtml.includes(`data-ad-slot="${SLOTS.after_intro}"`), 'after_intro partial');
assert.ok(endHtml.includes(`data-ad-slot="${SLOTS.end_content}"`), 'end_content partial');

const injected = injectBlogContentAdMarkers(articleHtml, wc);
assert.ok(injected.includes('data-fm-ad-mount="mid_content_1"'));
assert.ok(injected.includes('data-fm-ad-mount="mid_content_2"'));

const detailHtml = afterHtml + injected + endHtml;
for (const id of [SLOTS.after_intro, SLOTS.end_content]) {
  const count = (detailHtml.match(new RegExp(`data-ad-slot="${id}"`, 'g')) || []).length;
  assert.strictEqual(count, 1, `SSR slot ${id} should appear once on detail, got ${count}`);
}
assert.ok(injected.includes('data-fm-ad-mount="mid_content_1"'));
assert.ok(injected.includes('data-fm-ad-mount="mid_content_2"'));
assert.strictEqual(cfg.slots.mid_content_1, SLOTS.mid_content_1);
assert.strictEqual(cfg.slots.mid_content_2, SLOTS.mid_content_2);
assert.ok(!detailHtml.includes(`data-ad-slot="${SLOTS.listing_1}"`));
assert.ok(!detailHtml.includes(`data-ad-slot="${SLOTS.listing_2}"`));
assert.ok(!detailHtml.includes(`data-ad-slot="${SLOTS.display}"`));

const matrix = [
  [300, { after_intro: true, mid_content_1: false, mid_content_2: false, end_content: false }],
  [700, { after_intro: true, mid_content_1: true, mid_content_2: false, end_content: true }],
  [1000, { after_intro: true, mid_content_1: true, mid_content_2: false, end_content: true }],
  [1600, { after_intro: true, mid_content_1: true, mid_content_2: true, end_content: true }],
];
for (const [words, expected] of matrix) {
  const p = getBlogAdPlacements(words);
  for (const k of Object.keys(expected)) {
    assert.strictEqual(p[k], expected[k], `wordCount ${words} placement ${k}`);
  }
}

console.log('test-blog-detail-ad-render: OK');
process.exit(0);
