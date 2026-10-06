#!/usr/bin/env node
'use strict';

/**
 * One-shot publish: How to Choose a Data Science Capstone Project
 * Usage: node scripts/insert-blog-data-science-capstone.js
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

const queryAsync = util.promisify(pool2.query).bind(pool2);

const SLUG = 'how-to-choose-data-science-capstone-project';
const SITE = normalizeSiteOrigin(process.env.SITE_BASE_URL || 'https://www.filemakr.com').replace(/\/$/, '');
const CANONICAL = `${SITE}/blog/${SLUG}`;

const TITLE =
  'How to Choose a Good Data Science Capstone Project: Dataset, Scope & Evaluation Guide';
const META_TITLE = 'How to Choose a Data Science Capstone Project: Ideas & Scorecard';
const META_DESCRIPTION =
  'Learn how to choose a data science capstone project using a practical scorecard. Compare datasets, scope, baselines, metrics, ideas and final deliverables.';
const FOCUS_KEYWORD = 'data science capstone project';
const META_KEYWORDS =
  'data science capstone project, capstone project ideas, data science project ideas, final year data science, machine learning capstone, dataset selection';
const TAGS =
  'data science, capstone project, machine learning, final year project, dataset selection, scikit-learn';
const CATEGORY = 'explainer-blog';
const STATUS = 'published';

const ANSWER_SUMMARY =
  'Choose a data science capstone by confirming five things: a clear problem, obtainable data, measurable evaluation, realistic semester scope, and a demonstrable output someone can inspect or test. Start with the problem and dataset before picking algorithms. A simpler end-to-end project with a solid baseline often shows stronger ability than an unfinished advanced model.';

const KEY_TAKEAWAYS = [
  'Start with a problem rather than an algorithm.',
  'Inspect the actual dataset before committing to a title.',
  'Build a simple baseline before an advanced model.',
  'Select evaluation metrics according to the problem and cost of errors.',
  'Prevent data leakage by separating training and evaluation data correctly.',
  'Keep the minimum viable project small enough to finish end-to-end.',
  'Treat reproducibility, documentation and communication as part of the capstone.',
];

const ENTITIES_JSON = [
  { name: 'Data science capstone project', type: 'EducationalOccupationalProgram' },
  { name: 'scikit-learn', type: 'SoftwareApplication', sameAs: 'https://scikit-learn.org/' },
  { name: 'Logistic regression', type: 'DefinedTerm' },
  { name: 'UCI Machine Learning Repository', type: 'Organization', sameAs: 'https://archive.ics.uci.edu/' },
  { name: 'Data.gov', type: 'Organization', sameAs: 'https://www.data.gov/' },
];

const SOURCES_JSON = [
  {
    title: 'UCI Machine Learning Repository',
    url: 'https://archive.ics.uci.edu/',
    publisher: 'University of California, Irvine',
  },
  {
    title: 'Data.gov — U.S. open government data',
    url: 'https://www.data.gov/',
    publisher: 'U.S. General Services Administration',
  },
  {
    title: 'Open Government Data Platform India',
    url: 'https://data.gov.in/',
    publisher: 'National Informatics Centre, India',
  },
  {
    title: 'scikit-learn — Model evaluation',
    url: 'https://scikit-learn.org/stable/modules/model_evaluation.html',
    publisher: 'scikit-learn developers',
  },
  {
    title: 'scikit-learn — Dummy estimators',
    url: 'https://scikit-learn.org/stable/modules/generated/sklearn.dummy.DummyClassifier.html',
    publisher: 'scikit-learn developers',
  },
];

const META_ABSTRACT =
  'Choosing a data science capstone starts with problem clarity, real dataset access, and evaluation you can defend—not algorithm hype. This guide walks through dataset checks, a 40-point scorecard, baseline and metric choices, validation pitfalls like leakage, and a step-by-step path to a finishable end-to-end project.';

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
  const contentPath = path.join(__dirname, 'content', 'data-science-capstone-article.html');
  const content = fs.readFileSync(contentPath, 'utf8').trim();
  if (!content) throw new Error('Empty article HTML');

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
        null,
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
        null,
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

  console.log(
    JSON.stringify(
      {
        action,
        report: {
          ID: row.id,
          TITLE: row.title,
          SLUG: row.slug,
          URL: `${SITE}/blog/${row.slug}`,
          CATEGORY: row.category,
          FOCUS_KEYWORD,
          STATUS: row.status,
          AUTHOR: authorName,
          READING_TIME: row.reading_time_minutes,
          INTERNAL_LINKS: row.internal_links_count,
          META_TITLE: row.meta_title,
          META_DESCRIPTION: row.meta_description,
          INDEXNOW: indexNowStatus,
        },
      },
      null,
      2
    )
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('insert-blog-data-science-capstone:', err.message || err);
  process.exit(1);
});
