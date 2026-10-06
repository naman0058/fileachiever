'use strict';

const cheerio = require('cheerio');

function stripText($, el) {
  return String($(el).text() || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse top-level FAQ blocks: <h2>FAQ</h2> then <h3>Q</h3><p>A</p> until next <h2>.
 */
function extractFaqMainEntityFromHtml(html) {
  const raw = String(html || '').trim();
  if (!raw) return [];

  const $ = cheerio.load(`<div id="fm-faq-root">${raw}</div>`, { decodeEntities: false });
  const blocks = $('#fm-faq-root').children().toArray();
  let inFaq = false;
  let pendingQuestion = null;
  const entities = [];

  for (const el of blocks) {
    const tag = (el.tagName || '').toLowerCase();
    const text = stripText($, el);

    if (tag === 'h2' && /^faq\b/i.test(text)) {
      inFaq = true;
      pendingQuestion = null;
      continue;
    }
    if (inFaq && tag === 'h2') break;
    if (!inFaq) continue;

    if (tag === 'h3' && text) {
      pendingQuestion = text;
      continue;
    }
    if (tag === 'p' && pendingQuestion && text) {
      entities.push({
        '@type': 'Question',
        name: pendingQuestion,
        acceptedAnswer: {
          '@type': 'Answer',
          text,
        },
      });
      pendingQuestion = null;
    }
  }

  return entities;
}

function buildFaqPageNode(canonicalUrl, mainEntity) {
  if (!Array.isArray(mainEntity) || !mainEntity.length) return null;
  const canonical = String(canonicalUrl || '').replace(/\/$/, '');
  return {
    '@type': 'FAQPage',
    '@id': `${canonical}#faq`,
    isPartOf: { '@id': `${canonical}#article` },
    mainEntity,
  };
}

module.exports = {
  extractFaqMainEntityFromHtml,
  buildFaqPageNode,
};
