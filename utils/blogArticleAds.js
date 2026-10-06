'use strict';

const cheerio = require('cheerio');
const { getAdsenseConfig } = require('./adsenseConfig');

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const ATOMIC_TAGS = new Set(['table', 'ul', 'ol', 'pre', 'figure', 'blockquote']);
const BLOCK_TAGS = new Set([
  'p',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'table',
  'blockquote',
  'pre',
  'figure',
  'div',
  'section',
]);

function stripHtmlWords(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countArticleWords(html) {
  const t = stripHtmlWords(html);
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function adMarkerHtml(position) {
  return `<div class="fm-blog-ad-mount" data-fm-ad-mount="${position}" aria-hidden="true"></div>`;
}

/**
 * Which in-content mount keys to use for this word count (UX caps).
 */
function getBlogAdPlacements(wordCount) {
  const { thresholds } = getAdsenseConfig();
  const wc = Math.max(0, Number(wordCount) || 0);
  const placements = {
    after_intro: wc >= thresholds.minWordsAfterIntro,
    mid_content_1: wc >= thresholds.minWordsMid1,
    mid_content_2: wc >= thresholds.minWordsMid2,
    end_content: wc >= thresholds.minWordsEnd,
  };

  if (wc < 800) {
    placements.mid_content_2 = false;
    if (wc < 400) placements.mid_content_1 = false;
  }
  if (wc < 800 && wc >= 400) {
    placements.mid_content_1 = true;
    placements.mid_content_2 = false;
  }

  return placements;
}

function blockWordCount($, el) {
  return stripHtmlWords($(el).html()).split(/\s+/).filter(Boolean).length;
}

function isAtomicBlock($, el) {
  const tag = (el.tagName || '').toLowerCase();
  if (ATOMIC_TAGS.has(tag)) return true;
  if (tag === 'div') {
    if ($(el).hasClass('bd-table-wrap') || $(el).find('table').length) return true;
    if ($(el).hasClass('fm-blog-ad-mount')) return true;
  }
  return false;
}

function isHeading(el) {
  return HEADING_TAGS.has((el.tagName || '').toLowerCase());
}

function collectTopLevelBlocks($, $root) {
  const blocks = [];
  $root.children().each((_, el) => {
    const tag = (el.tagName || '').toLowerCase();
    if (!tag || tag === 'script' || tag === 'style') return;
    if (tag === 'h1') return;
    if (!BLOCK_TAGS.has(tag)) return;
    if (tag === 'div' && !$(el).hasClass('bd-table-wrap') && !$(el).children().length) return;
    blocks.push(el);
  });
  return blocks;
}

function findInsertIndexAfterProgress(blocks, $, targetWords, minGapWords) {
  let cumulative = 0;
  let lastInsertAt = -1;
  let lastInsertCumulative = 0;
  for (let i = 0; i < blocks.length; i++) {
    const w = blockWordCount($, blocks[i]);
    cumulative += w;
    if (cumulative < targetWords) continue;

    if (isHeading(blocks[i])) continue;
    if (i + 1 < blocks.length && isHeading(blocks[i + 1])) continue;
    if (i > 0 && isHeading(blocks[i - 1])) continue;
    if (isAtomicBlock($, blocks[i])) continue;

    if (lastInsertAt >= 0 && cumulative - lastInsertCumulative < minGapWords) continue;

    return { index: i, cumulative };
  }
  return null;
}

function injectBlogContentAdMarkers(html, wordCount) {
  const placements = getBlogAdPlacements(wordCount);
  if (!placements.mid_content_1 && !placements.mid_content_2) {
    return String(html || '');
  }

  const raw = String(html || '').trim();
  if (!raw) return raw;

  const $ = cheerio.load(`<div id="fm-article-root">${raw}</div>`, { decodeEntities: false });
  const $root = $('#fm-article-root');
  const blocks = collectTopLevelBlocks($, $root);
  if (blocks.length < 3) return raw;

  const totalWords = countArticleWords(raw);
  const { thresholds } = getAdsenseConfig();
  const minGap = 500;

  const inserts = [];

  if (placements.mid_content_2) {
    const t2 = Math.floor(totalWords * thresholds.mid2Progress);
    const hit = findInsertIndexAfterProgress(blocks, $, t2, minGap);
    if (hit) inserts.push({ index: hit.index, pos: 'mid_content_2', priority: 2 });
  }

  if (placements.mid_content_1) {
    const t1 = Math.floor(totalWords * thresholds.mid1Progress);
    const hit = findInsertIndexAfterProgress(blocks, $, t1, minGap);
    if (hit) {
      const conflict = inserts.find((x) => Math.abs(x.index - hit.index) < 2);
      if (!conflict) inserts.push({ index: hit.index, pos: 'mid_content_1', priority: 1 });
    }
  }

  inserts.sort((a, b) => b.index - a.index || b.priority - a.priority);
  const seen = new Set();
  for (const ins of inserts) {
    if (seen.has(ins.index)) continue;
    seen.add(ins.index);
    const el = blocks[ins.index];
    $(el).after(adMarkerHtml(ins.pos));
  }

  return $root.html() || raw;
}

module.exports = {
  countArticleWords,
  getBlogAdPlacements,
  injectBlogContentAdMarkers,
  stripHtmlWords,
};
