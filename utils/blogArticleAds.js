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

function blockHeadingText($, el) {
  return stripHtmlWords($(el).text()).toLowerCase();
}

function isAtomicBlock($, el) {
  const tag = (el.tagName || '').toLowerCase();
  if (ATOMIC_TAGS.has(tag)) return true;
  if (tag === 'div') {
    if ($(el).hasClass('bd-table-wrap') || $(el).find('table').length) return true;
    if ($(el).hasClass('fm-blog-ad-mount')) return true;
    const cls = String($(el).attr('class') || '');
    if (/faq|accordion|schema-faq/i.test(cls)) return true;
  }
  if (tag === 'section') {
    const cls = String($(el).attr('class') || '');
    if (/faq|accordion/i.test(cls)) return true;
    const it = String($(el).attr('itemtype') || '');
    if (/FAQPage/i.test(it)) return true;
  }
  return false;
}

function isHeading(el) {
  return HEADING_TAGS.has((el.tagName || '').toLowerCase());
}

const PROTECTED_SECTION_HEADING_RE =
  /^(faq\b|frequently asked|quick answer|key takeaways|topics mentioned)/i;

function isFaqSchemaNode($, el) {
  const $el = $(el);
  const itemtype = String($el.attr('itemtype') || '');
  const itemprop = String($el.attr('itemprop') || '');
  if (/FAQPage|Question/i.test(itemtype)) return true;
  if (itemprop === 'acceptedAnswer' || itemprop === 'mainEntity' || itemprop === 'suggestedAnswer') {
    return true;
  }
  if ($el.find('[itemtype*="Question"], [itemprop="acceptedAnswer"]').length) return true;
  return false;
}

/**
 * Mark block indices in FAQ / Quick Answer / Key Takeaways regions (no mid-content ads).
 */
function buildFaqProtectedMask(blocks, $) {
  const mask = new Array(blocks.length).fill(false);
  let inProtectedSection = false;

  for (let i = 0; i < blocks.length; i++) {
    const el = blocks[i];
    const tag = (el.tagName || '').toLowerCase();
    const text = blockHeadingText($, el);

    if (isFaqSchemaNode($, el)) {
      inProtectedSection = true;
      mask[i] = true;
      continue;
    }

    if (tag === 'h2' && PROTECTED_SECTION_HEADING_RE.test(text)) {
      inProtectedSection = true;
      mask[i] = true;
      continue;
    }

    if (inProtectedSection && tag === 'h2') {
      inProtectedSection = false;
    }

    if (inProtectedSection) {
      mask[i] = true;
    }
  }

  return mask;
}

function isBlockAdEligible(blocks, $, index, faqMask) {
  if (faqMask[index]) return false;
  if (isHeading(blocks[index])) return false;
  if (index + 1 < blocks.length && isHeading(blocks[index + 1])) return false;
  if (index > 0 && isHeading(blocks[index - 1])) return false;
  if (isAtomicBlock($, blocks[index])) return false;
  if (isFaqSchemaNode($, blocks[index])) return false;
  return true;
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

function findInsertIndexAfterProgress(blocks, $, targetWords, minGapWords, faqMask) {
  let cumulative = 0;
  let lastInsertCumulative = 0;

  for (let i = 0; i < blocks.length; i++) {
    const w = blockWordCount($, blocks[i]);
    cumulative += w;
    if (cumulative < targetWords) continue;
    if (!isBlockAdEligible(blocks, $, i, faqMask)) continue;

    if (lastInsertCumulative > 0 && cumulative - lastInsertCumulative < minGapWords) continue;

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

  const faqMask = buildFaqProtectedMask(blocks, $);
  const totalWords = countArticleWords(raw);
  const { thresholds } = getAdsenseConfig();
  const minGap = 500;

  const inserts = [];

  if (placements.mid_content_2) {
    const t2 = Math.floor(totalWords * thresholds.mid2Progress);
    const hit = findInsertIndexAfterProgress(blocks, $, t2, minGap, faqMask);
    if (hit) inserts.push({ index: hit.index, pos: 'mid_content_2', priority: 2 });
  }

  if (placements.mid_content_1) {
    const t1 = Math.floor(totalWords * thresholds.mid1Progress);
    const hit = findInsertIndexAfterProgress(blocks, $, t1, minGap, faqMask);
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

/** Dev/debug: explain mid-content insertion decisions */
function explainMidContentPlacements(html, wordCount) {
  const placements = getBlogAdPlacements(wordCount);
  const raw = String(html || '').trim();
  const out = { wordCount, eligible: placements, rendered: {}, skipped: {} };

  if (!placements.mid_content_1 && !placements.mid_content_2) {
    out.skipped.mid_content_1 = 'word count below threshold';
    out.skipped.mid_content_2 = 'word count below threshold';
    return out;
  }

  const $ = cheerio.load(`<div id="fm-article-root">${raw}</div>`, { decodeEntities: false });
  const blocks = collectTopLevelBlocks($, $('#fm-article-root'));
  const faqMask = buildFaqProtectedMask(blocks, $);
  const totalWords = countArticleWords(raw);
  const { thresholds } = getAdsenseConfig();
  const minGap = 500;

  for (const [key, prog, minW] of [
    ['mid_content_1', thresholds.mid1Progress, placements.mid_content_1],
    ['mid_content_2', thresholds.mid2Progress, placements.mid_content_2],
  ]) {
    if (!minW) {
      out.skipped[key] = 'not eligible for article length';
      continue;
    }
    const hit = findInsertIndexAfterProgress(
      blocks,
      $,
      Math.floor(totalWords * prog),
      minGap,
      faqMask
    );
    if (hit) out.rendered[key] = { blockIndex: hit.index, cumulativeWords: hit.cumulative };
    else out.skipped[key] = 'no safe block boundary (FAQ/atomic/heading/spacing)';
  }
  return out;
}

module.exports = {
  countArticleWords,
  getBlogAdPlacements,
  injectBlogContentAdMarkers,
  explainMidContentPlacements,
  buildFaqProtectedMask,
  stripHtmlWords,
};
