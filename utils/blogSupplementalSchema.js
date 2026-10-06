'use strict';

const cheerio = require('cheerio');

function stripText($, el) {
  return String($(el).text() || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract HowTo steps after an <h2> whose text matches sectionRe (e.g. /step-by-step/i).
 */
function extractHowToStepsFromHtml(html, sectionRe) {
  const raw = String(html || '').trim();
  if (!raw) return [];

  const $ = cheerio.load(`<div id="fm-howto-root">${raw}</div>`, { decodeEntities: false });
  const blocks = $('#fm-howto-root').children().toArray();
  let inSection = false;
  let pendingName = null;
  const steps = [];

  for (const el of blocks) {
    const tag = (el.tagName || '').toLowerCase();
    const text = stripText($, el);

    if (tag === 'h2' && sectionRe.test(text)) {
      inSection = true;
      pendingName = null;
      continue;
    }
    if (inSection && tag === 'h2') break;
    if (!inSection) continue;

    if (tag === 'h3' && text) {
      if (pendingName) {
        steps.push({ name: pendingName, text: pendingName });
      }
      pendingName = text.replace(/^step\s*\d+\s*[—–-]\s*/i, '').trim() || text;
      continue;
    }
    if (tag === 'p' && pendingName && text) {
      steps.push({ name: pendingName, text });
      pendingName = null;
    }
  }

  return steps;
}

function countryAudienceNode(targetCountry) {
  const code = String(targetCountry || '').trim().toUpperCase();
  if (!code) return null;
  const names = {
    US: 'United States',
    IN: 'India',
    GB: 'United Kingdom',
    CA: 'Canada',
    AU: 'Australia',
  };
  const name = names[code] || code;
  return {
    '@type': 'Audience',
    audienceType: 'Students and educators',
    geographicArea: {
      '@type': 'Country',
      name,
    },
  };
}

function buildTakeawaysItemList(canonicalUrl, takeaways) {
  const list = Array.isArray(takeaways) ? takeaways.filter(Boolean) : [];
  if (!list.length) return null;
  const canonical = String(canonicalUrl || '').replace(/\/$/, '');
  return {
    '@type': 'ItemList',
    '@id': `${canonical}#takeaways`,
    name: 'Key takeaways',
    itemListElement: list.map((line, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Thing',
        name: String(line).trim(),
      },
    })),
  };
}

/**
 * JSON stored in blogs.schema_markup — merged into page JSON-LD (no duplicate BlogPosting/FAQPage).
 */
function buildSupplementalSchemaMarkup(post, options = {}) {
  const canonical = String(options.canonicalUrl || post.canonical_url || '').replace(/\/$/, '');
  const title = String(post.meta_title || post.title || '').trim();
  const description = String(post.meta_description || post.meta_abstract || '').trim();
  const html = post.content || '';
  const graph = [];

  const howSteps = extractHowToStepsFromHtml(html, /step-by-step/i);
  if (howSteps.length) {
    graph.push({
      '@type': 'HowTo',
      '@id': `${canonical}#howto`,
      name: 'Turn a data science capstone idea into a finished project',
      description:
        description ||
        'A step-by-step workflow for choosing a problem, validating data, scoping, and delivering an end-to-end capstone.',
      inLanguage: post.language_code || 'en-US',
      isPartOf: { '@id': `${canonical}#article` },
      step: howSteps.map((s, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: s.name,
        text: s.text,
      })),
    });
  }

  graph.push({
    '@type': 'LearningResource',
    '@id': `${canonical}#guide`,
    name: title,
    description,
    learningResourceType: 'Guide',
    inLanguage: post.language_code || 'en-US',
    isAccessibleForFree: true,
    isPartOf: { '@id': `${canonical}#article` },
    about: {
      '@type': 'EducationalOccupationalProgram',
      name: 'Data science capstone project',
    },
  });

  const takeawaysList = buildTakeawaysItemList(
    canonical,
    post.key_takeaways || options.key_takeaways
  );
  if (takeawaysList) graph.push(takeawaysList);

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': graph,
  });
}

module.exports = {
  extractHowToStepsFromHtml,
  buildSupplementalSchemaMarkup,
  countryAudienceNode,
  buildTakeawaysItemList,
};
