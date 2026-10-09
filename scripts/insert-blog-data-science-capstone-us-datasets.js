#!/usr/bin/env node
'use strict';

/**
 * Publish: 10 Data Science Capstone Project Ideas With US Datasets
 * Usage: node scripts/insert-blog-data-science-capstone-us-datasets.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const util = require('util');
const pool2 = require('../routes/pool2');
const { invalidateBlogReadCache, resolveDetailSelect } = require('../services/blogReadService');
const indexNowService = require('../services/indexNowService');
const {
  validateBlogContentPayload,
  serializeJsonColumn,
} = require('../utils/blogContentModel');
const { normalizeSiteOrigin } = require('../utils/canonicalHost');
const { buildSupplementalSchemaMarkup } = require('../utils/blogSupplementalSchema');
const { markdownArticleToBlogHtml } = require('./lib/markdownArticleToBlogHtml');

const queryAsync = util.promisify(pool2.query).bind(pool2);

const SLUG = 'data-science-capstone-project-ideas';
const SITE = normalizeSiteOrigin(process.env.SITE_BASE_URL || 'https://www.filemakr.com').replace(/\/$/, '');
const CANONICAL = `${SITE}/blog/${SLUG}`;

const TITLE = '10 Data Science Capstone Project Ideas With US Datasets';
const META_TITLE = '10 Data Science Capstone Ideas With US Datasets';
const META_DESCRIPTION =
  'Compare 10 data science capstone project ideas using public US datasets—TLC taxi, CFPB, EIA, ACS and NOAA—with scopes, skills and evaluation plans.';
const FOCUS_KEYWORD = 'data science capstone project ideas';
const META_KEYWORDS =
  'data science capstone project, capstone project ideas, US datasets, NYC taxi data, CFPB complaints, EIA electricity data';
const TAGS =
  'data science, capstone project, US datasets, Python, time series, ACS, final year project';
const CATEGORY = 'explainer-blog';
const STATUS = 'published';
const THUMBNAIL_URL =
  'https://res.cloudinary.com/zbuzl6te/image/upload/v1791514136/10_data_science_capstone_projects.webp';

const ANSWER_SUMMARY =
  'For a beginner analytical capstone, consider an electricity-generation dashboard or a county housing-cost comparison. For machine learning, consider taxi-demand forecasting or complaint classification. For a more advanced project, investigate weather-sensitive electricity demand. Choose according to your skills, data access, and your program\'s evaluation requirements.';

const KEY_TAKEAWAYS = [
  'Start with one location, a fixed period, and one research question.',
  'Predictive projects need a baseline and genuinely held-out evaluation.',
  'Analytical dashboards need validated calculations and clear limitations.',
  'Confirm fields, units, access, and missingness before writing your proposal.',
  'Demonstrate your own contribution through reproducible analysis and honest findings.',
];

const ENTITIES_JSON = [
  { name: 'Data science capstone project', type: 'EducationalOccupationalProgram' },
  { name: 'NYC Taxi and Limousine Commission', type: 'Organization' },
  { name: 'Consumer Financial Protection Bureau', type: 'Organization' },
  { name: 'U.S. Energy Information Administration', type: 'Organization', sameAs: 'https://www.eia.gov/' },
  { name: 'American Community Survey', type: 'DefinedTerm' },
  { name: 'NOAA GHCN-Daily', type: 'DefinedTerm' },
  { name: 'scikit-learn', type: 'SoftwareApplication', sameAs: 'https://scikit-learn.org/' },
  { name: 'Python', type: 'Thing' },
];

const SOURCES_JSON = [
  {
    title: 'NYC TLC Trip Record Data',
    url: 'https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page',
    publisher: 'NYC Taxi and Limousine Commission',
  },
  {
    title: 'CFPB Consumer Complaint Database',
    url: 'https://www.consumerfinance.gov/data-research/consumer-complaints/',
    publisher: 'Consumer Financial Protection Bureau',
  },
  {
    title: 'EIA Open Data',
    url: 'https://www.eia.gov/opendata/',
    publisher: 'U.S. Energy Information Administration',
  },
  {
    title: 'EIA Hourly Electric Grid Monitor',
    url: 'https://www.eia.gov/electricity/gridmonitor/',
    publisher: 'U.S. Energy Information Administration',
  },
  {
    title: 'Census ACS Table B25070',
    url: 'https://data.census.gov/',
    publisher: 'U.S. Census Bureau',
  },
  {
    title: 'NOAA GHCN-Daily',
    url: 'https://www.ncei.noaa.gov/products/land-based-station/global-historical-climatology-network-daily',
    publisher: 'NOAA National Centers for Environmental Information',
  },
  {
    title: 'scikit-learn — Common Pitfalls and Recommended Practices',
    url: 'https://scikit-learn.org/stable/common_pitfalls.html',
    publisher: 'scikit-learn developers',
  },
];

const META_ABSTRACT =
  'This guide compares ten data science capstone ideas built on public US datasets, including NYC taxi records, CFPB complaints, EIA electricity data, ACS survey tables and NOAA weather observations. Each idea includes a research question, suggested scope, skills, difficulty and evaluation approach for seniors and portfolio builders.';

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
  const mdPath = path.join(__dirname, 'content', 'data-science-capstone-us-datasets.source.md');
  const raw = fs.readFileSync(mdPath, 'utf8');
  const html = markdownArticleToBlogHtml(raw).trim();
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
      thumbnail_url: THUMBNAIL_URL,
    },
    { canonicalUrl: CANONICAL, imageUrl: THUMBNAIL_URL }
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
        schema_markup = ?, thumbnail_url = ?, status = ?, reading_time_minutes = ?, internal_links_count = ?,
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
        THUMBNAIL_URL,
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
        THUMBNAIL_URL,
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
  console.log('THUMBNAIL:', THUMBNAIL_URL);
  console.log('AEO: Quick Answer: Added | Key Takeaways: Added');
  console.log('INDEXNOW:', indexNowStatus);
  console.log('ACTION:', action);
  console.log('FINAL URL:', `${SITE}/blog/${row.slug}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('insert-blog-data-science-capstone-us-datasets:', err.message || err);
  process.exit(1);
});
