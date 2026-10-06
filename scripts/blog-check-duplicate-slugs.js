#!/usr/bin/env node
'use strict';

/**
 * Report duplicate blog slugs (non-destructive).
 * Usage: node scripts/blog-check-duplicate-slugs.js
 */

require('dotenv').config();
const util = require('util');
const pool2 = require('../routes/pool2');
const queryAsync = util.promisify(pool2.query).bind(pool2);

async function main() {
  const rows = await queryAsync(
    `SELECT slug, COUNT(*) AS cnt, GROUP_CONCAT(id ORDER BY id) AS blog_ids,
            MIN(created_at) AS first_created, MAX(created_at) AS last_created
     FROM blogs
     WHERE slug IS NOT NULL AND TRIM(slug) <> ''
     GROUP BY slug
     HAVING cnt > 1
     ORDER BY cnt DESC, slug ASC`
  );

  if (!rows.length) {
    console.log('OK: no duplicate slugs in automate_blog.blogs');
    process.exit(0);
  }

  console.log(`Found ${rows.length} duplicate slug(s):\n`);
  for (const r of rows) {
    console.log(
      `- slug="${r.slug}" count=${r.cnt} ids=[${r.blog_ids}] created=${r.first_created}..${r.last_created}`
    );
  }
  console.log('\nDo NOT add UNIQUE(slug) until resolved.');
  console.log('Optional: node scripts/blog-remediate-duplicate-slugs.js --dry-run');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
