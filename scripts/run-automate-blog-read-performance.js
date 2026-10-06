#!/usr/bin/env node
'use strict';

/**
 * Idempotent index migration for automate_blog.blogs (non-destructive).
 * Usage: node scripts/run-automate-blog-read-performance.js [--add-unique-slug]
 */

require('dotenv').config();
const util = require('util');
const pool2 = require('../routes/pool2');
const queryAsync = util.promisify(pool2.query).bind(pool2);

const INDEXES = [
  { name: 'idx_blogs_slug', sql: 'ALTER TABLE `blogs` ADD INDEX `idx_blogs_slug` (`slug`)' },
  {
    name: 'idx_blogs_status_created_id',
    sql: 'ALTER TABLE `blogs` ADD INDEX `idx_blogs_status_created_id` (`status`, `created_at`, `id`)',
  },
  {
    name: 'idx_blogs_cat_status_created',
    sql: 'ALTER TABLE `blogs` ADD INDEX `idx_blogs_cat_status_created` (`category`, `status`, `created_at`, `id`)',
  },
  {
    name: 'idx_blogs_author_status_created',
    sql: 'ALTER TABLE `blogs` ADD INDEX `idx_blogs_author_status_created` (`author_id`, `status`, `created_at`, `id`)',
  },
  {
    name: 'idx_blogs_status_updated',
    sql: 'ALTER TABLE `blogs` ADD INDEX `idx_blogs_status_updated` (`status`, `updated_at`)',
  },
  {
    name: 'ft_blog_search',
    sql: 'ALTER TABLE `blogs` ADD FULLTEXT INDEX `ft_blog_search` (`title`, `meta_abstract`, `tags`, `meta_keywords`)',
  },
];

const UNIQUE_SLUG = {
  name: 'uq_blogs_slug',
  sql: 'ALTER TABLE `blogs` ADD UNIQUE INDEX `uq_blogs_slug` (`slug`)',
};

async function existingIndexNames() {
  const rows = await queryAsync('SHOW INDEX FROM blogs');
  const names = new Set();
  for (const r of rows || []) {
    if (r.Key_name) names.add(r.Key_name);
  }
  return names;
}

function indexCovers(existingRows, keyName, columnSeq) {
  const cols = (existingRows || [])
    .filter((r) => r.Key_name === keyName)
    .sort((a, b) => a.Seq_in_index - b.Seq_in_index)
    .map((r) => r.Column_name);
  if (cols.length !== columnSeq.length) return false;
  return columnSeq.every((c, i) => cols[i] === c);
}

async function findEquivalentIndex(columnSeq) {
  const rows = await queryAsync('SHOW INDEX FROM blogs');
  const byKey = {};
  for (const r of rows || []) {
    if (!byKey[r.Key_name]) byKey[r.Key_name] = [];
    byKey[r.Key_name].push(r);
  }
  for (const [keyName, keyRows] of Object.entries(byKey)) {
    if (indexCovers(keyRows, keyName, columnSeq)) return keyName;
  }
  return null;
}

async function addIndex(def, existing) {
  if (existing.has(def.name)) {
    console.log(`reuse: ${def.name} (already exists)`);
    return 'reused';
  }
  const equivMap = {
    idx_blogs_status_created_id: ['status', 'created_at', 'id'],
    idx_blogs_cat_status_created: ['category', 'status', 'created_at', 'id'],
    idx_blogs_author_status_created: ['author_id', 'status', 'created_at', 'id'],
    idx_blogs_status_updated: ['status', 'updated_at'],
    idx_blogs_slug: ['slug'],
  };
  const seq = equivMap[def.name];
  if (seq) {
    const equiv = await findEquivalentIndex(seq);
    if (equiv) {
      console.log(`reuse: ${def.name} (equivalent ${equiv})`);
      return 'equivalent';
    }
  }
  try {
    await queryAsync(def.sql);
    console.log(`added: ${def.name}`);
    return 'added';
  } catch (err) {
    if (err && (err.code === 'ER_DUP_KEYNAME' || err.errno === 1061)) {
      console.log(`reuse: ${def.name} (${err.message})`);
      return 'reused';
    }
    throw err;
  }
}

async function duplicateSlugCount() {
  const rows = await queryAsync(
    `SELECT COUNT(*) AS groups FROM (
       SELECT slug FROM blogs
       WHERE slug IS NOT NULL AND TRIM(slug) <> ''
       GROUP BY slug HAVING COUNT(*) > 1
     ) t`
  );
  return rows[0]?.groups || 0;
}

async function main() {
  const addUnique = process.argv.includes('--add-unique-slug');
  const existing = await existingIndexNames();

  console.log('Existing blog indexes:', [...existing].sort().join(', ') || '(none)');
  console.log('---');

  const stats = { added: 0, reused: 0, equivalent: 0 };
  for (const def of INDEXES) {
    const r = await addIndex(def, existing);
    if (r === 'added') stats.added += 1;
    if (r === 'reused') stats.reused += 1;
    if (r === 'equivalent') stats.equivalent += 1;
    if (r === 'added') existing.add(def.name);
  }

  const dupGroups = await duplicateSlugCount();
  if (dupGroups > 0) {
    console.log(`\nWARN: ${dupGroups} duplicate slug group(s). UNIQUE(slug) skipped.`);
    console.log('Run: node scripts/blog-check-duplicate-slugs.js');
  } else if (addUnique) {
    const r = await addIndex(UNIQUE_SLUG, existing);
    if (r === 'added') stats.added += 1;
    else stats.reused += 1;
  } else {
    console.log('\nNo duplicate slugs. To add UNIQUE(slug): re-run with --add-unique-slug');
  }

  console.log('\nSummary:', stats);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
