#!/usr/bin/env node
'use strict';

/**
 * Non-destructive duplicate slug remediation: append -id to duplicate slugs
 * (keeps oldest row slug unchanged). Never deletes rows.
 *
 * Usage:
 *   node scripts/blog-remediate-duplicate-slugs.js --dry-run
 *   node scripts/blog-remediate-duplicate-slugs.js
 */

require('dotenv').config();
const util = require('util');
const pool2 = require('../routes/pool2');
const queryAsync = util.promisify(pool2.query).bind(pool2);

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const dups = await queryAsync(
    `SELECT slug, GROUP_CONCAT(id ORDER BY id) AS ids
     FROM blogs
     WHERE slug IS NOT NULL AND TRIM(slug) <> ''
     GROUP BY slug
     HAVING COUNT(*) > 1`
  );

  if (!dups.length) {
    console.log('No duplicate slugs.');
    return;
  }

  let updates = 0;
  for (const group of dups) {
    const ids = String(group.ids || '')
      .split(',')
      .map((x) => parseInt(x, 10))
      .filter(Number.isFinite);
    const keepId = ids[0];
    const renameIds = ids.slice(1);
    for (const id of renameIds) {
      const newSlug = `${group.slug}-${id}`;
      console.log(`${dryRun ? '[dry-run] ' : ''}id=${id}: "${group.slug}" -> "${newSlug}" (keep id=${keepId})`);
      if (!dryRun) {
        await queryAsync('UPDATE blogs SET slug = ?, updated_at = NOW() WHERE id = ?', [newSlug, id]);
      }
      updates += 1;
    }
  }

  console.log(`Done. ${updates} slug(s) ${dryRun ? 'would be ' : ''}updated.`);
  if (!dryRun) {
    const { invalidateBlogReadCache } = require('../services/blogReadService');
    invalidateBlogReadCache();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
