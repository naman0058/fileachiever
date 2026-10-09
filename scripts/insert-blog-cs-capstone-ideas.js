#!/usr/bin/env node
'use strict';

/**
 * Publish: 20 Computer Science Capstone Project Ideas (2026)
 * Usage: node scripts/insert-blog-cs-capstone-ideas.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const util = require('util');
const pool2 = require('../routes/pool2');
const { invalidateBlogReadCache } = require('../services/blogReadService');
const indexNowService = require('../services/indexNowService');
const {
  validateBlogContentPayload,
  serializeJsonColumn,
} = require('../utils/blogContentModel');
const { normalizeSiteOrigin } = require('../utils/canonicalHost');
const { resolveDetailSelect } = require('../services/blogReadService');
const { buildSupplementalSchemaMarkup } = require('../utils/blogSupplementalSchema');
const { markdownArticleToBlogHtml } = require('./lib/markdownArticleToBlogHtml');

const queryAsync = util.promisify(pool2.query).bind(pool2);

const SLUG = 'computer-science-capstone-project-ideas';
const SITE = normalizeSiteOrigin(process.env.SITE_BASE_URL || 'https://www.filemakr.com').replace(/\/$/, '');
const CANONICAL = `${SITE}/blog/${SLUG}`;

const TITLE = '20 Computer Science Capstone Project Ideas for Students (2026)';
const META_TITLE = '20 Computer Science Capstone Project Ideas for 2026';
const META_DESCRIPTION =
  'Compare 20 computer science capstone project ideas for 2026 with tech stacks, difficulty, MVPs, testing methods and practical selection tips for students.';
const FOCUS_KEYWORD = 'computer science capstone project ideas';
const META_KEYWORDS =
  'computer science capstone project, capstone project ideas, final year project, MERN capstone, Python capstone, cybersecurity project';
const TAGS =
  'computer science, capstone project, final year project, Python, MERN, cybersecurity, web development';
const CATEGORY = 'explainer-blog';
const STATUS = 'published';

const ANSWER_SUMMARY =
  'Strong computer science capstone projects combine a clear problem, a stack you can implement, and measurable evidence. Beginners often succeed with inventory or expense analytics; intermediate students can build booking, chat or NLP tools; advanced work may include DDoS detection, secure vaults or ERP systems. Pick an achievable MVP and test the core engineering challenge—not just the UI.';

const KEY_TAKEAWAYS = [
  'Match project difficulty to your skills, data access and semester timeline.',
  'Define an MVP and acceptance tests before expanding features.',
  'Web capstones need server-side authorization and transactional correctness.',
  'ML capstones need baselines, held-out evaluation and honest limitations.',
  'Security projects require a clear threat model and permission to test.',
  'Package reproducible setup steps, tests and evidence—not only screenshots.',
];

const ENTITIES_JSON = [
  { name: 'Computer science capstone project', type: 'EducationalOccupationalProgram' },
  { name: 'Python', type: 'Thing' },
  { name: 'MySQL', type: 'Thing' },
  { name: 'React', type: 'Thing' },
  { name: 'scikit-learn', type: 'SoftwareApplication', sameAs: 'https://scikit-learn.org/' },
  { name: 'Socket.IO', type: 'SoftwareApplication', sameAs: 'https://socket.io/' },
  { name: 'OWASP Top 10', type: 'DefinedTerm', sameAs: 'https://owasp.org/' },
];

const SOURCES_JSON = [
  {
    title: 'scikit-learn — Common Pitfalls and Recommended Practices',
    url: 'https://scikit-learn.org/stable/common_pitfalls.html',
    publisher: 'scikit-learn developers',
  },
  {
    title: 'University of New Brunswick — CICDDoS2019',
    url: 'https://www.unb.ca/cic/datasets/ddos-2019.html',
    publisher: 'Canadian Institute for Cybersecurity',
  },
  {
    title: 'OWASP Top 10:2025',
    url: 'https://top10.owasp.org/2025/',
    publisher: 'OWASP Foundation',
  },
  {
    title: 'W3C — WCAG 2.2 Quick Reference',
    url: 'https://www.w3.org/WAI/WCAG22/quickref/',
    publisher: 'W3C Web Accessibility Initiative',
  },
  {
    title: 'UCI Machine Learning Repository',
    url: 'https://archive.ics.uci.edu/',
    publisher: 'University of California, Irvine',
  },
  {
    title: 'Open Government Data Platform India',
    url: 'https://data.gov.in/',
    publisher: 'National Informatics Centre, India',
  },
  {
    title: 'Michigan State University — Computer Science Capstone Projects',
    url: 'https://capstone.cse.msu.edu/projects/',
    publisher: 'Michigan State University',
  },
];

const META_ABSTRACT =
  'This guide compares 20 computer science capstone project ideas for 2026 across AI, web development, cybersecurity and analytics. Each idea includes a suggested stack, MVP scope, core engineering contribution and practical evaluation approach, plus selection scorecards, resource requirements and common mistakes to avoid.';

function countInternalLinks(html) {
  const re = /href="(\/[^"]+|https?:\/\/(?:www\.)?filemakr\.com[^"]*)"/gi;
  let n = 0;
  let m;
  while ((m = re.exec(html)) !== null) n += 1;
  return n;
}

function readingMinutes(html) {
  const text = String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function loadArticleHtml() {
  const mdPath = path.join(__dirname, 'content', 'computer-science-capstone-project-ideas.source.md');
  const raw = fs.readFileSync(mdPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const bodyStart = lines.findIndex((l) => /^## Quick Answer:/i.test(l.trim()));
  const slice = bodyStart >= 0 ? lines.slice(bodyStart).join('\n') : raw;
  const html = markdownArticleToBlogHtml(slice).trim();
  if (!html) throw new Error('Converted HTML is empty');
  return html;
}

async function pickAuthorId() {
  const rows = await queryAsync(
    'SELECT id, name, status FROM blog_writers WHERE status = ? ORDER BY id ASC LIMIT 1',
    ['active']
  );
  if (rows && rows[0]) return { id: rows[0].id, name: rows[0].name };
  return { id: null, name: 'FileMakr Team' };
}

async function findDuplicate() {
  const bySlug = await queryAsync(
    'SELECT id, slug, title, canonical_url, status, created_at FROM blogs WHERE slug = ? LIMIT 1',
    [SLUG]
  );
  if (bySlug && bySlug[0]) return { match: 'slug', row: bySlug[0] };

  const byCanon = await queryAsync(
    'SELECT id, slug, title, canonical_url, status, created_at FROM blogs WHERE canonical_url = ? LIMIT 1',
    [CANONICAL]
  );
  if (byCanon && byCanon[0]) return { match: 'canonical', row: byCanon[0] };

  const byTitle = await queryAsync(
    'SELECT id, slug, title, canonical_url, status, created_at FROM blogs WHERE LOWER(TRIM(title)) = LOWER(TRIM(?)) LIMIT 1',
    [TITLE]
  );
  if (byTitle && byTitle[0]) return { match: 'title', row: byTitle[0] };

  return null;
}

async function main() {
  const content = loadArticleHtml();

  const payload = validateBlogContentPayload({
    language_code: 'en-US',
    target_country: 'US',
    answer_summary: ANSWER_SUMMARY,
    key_takeaways: KEY_TAKEAWAYS,
    entities_json: JSON.stringify(ENTITIES_JSON),
    sources_json: JSON.stringify(SOURCES_JSON),
  });
  if (!payload.ok) throw new Error(payload.msg);

  const cf = payload.data;
  const internalLinks = countInternalLinks(content);
  const readingTime = readingMinutes(content);
  const author = await pickAuthorId();

  const schemaMarkup = buildSupplementalSchemaMarkup(
    {
      title: TITLE,
      meta_title: META_TITLE,
      meta_description: META_DESCRIPTION,
      meta_abstract: META_ABSTRACT,
      content,
      language_code: cf.language_code,
      target_country: cf.target_country,
      key_takeaways: cf.key_takeaways,
      canonical_url: CANONICAL,
    },
    { canonicalUrl: CANONICAL }
  );

  const dup = await findDuplicate();
  const ktDb = serializeJsonColumn(cf.key_takeaways);
  const entDb = serializeJsonColumn(cf.entities_json);
  const srcDb = serializeJsonColumn(cf.sources_json);

  let blogId;
  let action;

  if (dup && dup.row) {
    action = 'UPDATE';
    blogId = dup.row.id;
    await queryAsync(
      `UPDATE blogs SET
        title = ?, slug = ?, content = ?, meta_title = ?, meta_description = ?,
        focus_keyword = ?, canonical_url = ?, category = ?, meta_keywords = ?, tags = ?, meta_abstract = ?,
        schema_markup = ?, status = ?, reading_time_minutes = ?, internal_links_count = ?,
        language_code = ?, target_country = ?, answer_summary = ?, key_takeaways = ?, entities_json = ?, sources_json = ?,
        updated_at = NOW()
      WHERE id = ?`,
      [
        TITLE,
        SLUG,
        content,
        META_TITLE,
        META_DESCRIPTION,
        FOCUS_KEYWORD,
        CANONICAL,
        CATEGORY,
        META_KEYWORDS,
        TAGS,
        META_ABSTRACT,
        schemaMarkup,
        STATUS,
        readingTime,
        internalLinks,
        cf.language_code,
        cf.target_country,
        cf.answer_summary,
        ktDb,
        entDb,
        srcDb,
        blogId,
      ]
    );
  } else {
    action = 'INSERT';
    if (!author.id) {
      throw new Error('No active blog_writers row; create an editorial author before publishing.');
    }
    const result = await queryAsync(
      `INSERT INTO blogs (
        title, slug, content, meta_title, meta_description,
        focus_keyword, canonical_url, category, meta_keywords, tags, meta_abstract,
        schema_markup, thumbnail_url, status, author_id, reading_time_minutes, internal_links_count,
        language_code, target_country, answer_summary, key_takeaways, entities_json, sources_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        TITLE,
        SLUG,
        content,
        META_TITLE,
        META_DESCRIPTION,
        FOCUS_KEYWORD,
        CANONICAL,
        CATEGORY,
        META_KEYWORDS,
        TAGS,
        META_ABSTRACT,
        schemaMarkup,
        null,
        STATUS,
        author.id,
        readingTime,
        internalLinks,
        cf.language_code,
        cf.target_country,
        cf.answer_summary,
        ktDb,
        entDb,
        srcDb,
      ]
    );
    blogId = result.insertId;
  }

  invalidateBlogReadCache();

  let indexNowStatus = 'Not Configured';
  if (indexNowService.isConfigured()) {
    await indexNowService.notifyBlogUrlChange(SLUG, { force: true });
    indexNowStatus = 'Submitted';
  }

  await resolveDetailSelect();

  const verify = await queryAsync(
    `SELECT id, title, slug, meta_title, meta_description, category, canonical_url, status,
            reading_time_minutes, internal_links_count, author_id, created_at, updated_at
     FROM blogs WHERE id = ? LIMIT 1`,
    [blogId]
  );
  const row = verify[0];
  if (!row || row.slug !== SLUG) throw new Error('Post-insert verification failed');

  const authorName =
    author.id && author.name
      ? author.name
      : (await queryAsync('SELECT name FROM blog_writers WHERE id = ? LIMIT 1', [row.author_id]))[0]
          ?.name || 'FileMakr Team';

  console.log('BLOG INSERTION COMPLETE');
  console.log('ID:', row.id);
  console.log('TITLE:', row.title);
  console.log('SLUG:', row.slug);
  console.log('URL:', `${SITE}/blog/${row.slug}`);
  console.log('CATEGORY:', row.category);
  console.log('FOCUS KEYWORD:', FOCUS_KEYWORD);
  console.log('STATUS:', row.status);
  console.log('AUTHOR:', authorName);
  console.log('READING TIME:', row.reading_time_minutes);
  console.log('INTERNAL LINKS:', row.internal_links_count);
  console.log('META TITLE:', row.meta_title);
  console.log('META DESCRIPTION:', row.meta_description);
  console.log('AEO: Quick Answer: Added | Key Takeaways: Added');
  console.log('INDEXNOW:', indexNowStatus);
  console.log('ACTION:', action);
  console.log('FINAL URL:', `${SITE}/blog/${row.slug}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('insert-blog-cs-capstone-ideas:', err.message || err);
  process.exit(1);
});
