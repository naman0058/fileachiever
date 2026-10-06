#!/usr/bin/env node
'use strict';

/**
 * EXPLAIN blog read queries against automate_blog (dev/ops).
 * Usage: node scripts/explain-blog-queries.js
 */

require('dotenv').config();
const util = require('util');
const pool2 = require('../routes/pool2');
const { explainQueryFixtures, detectFulltextIndex } = require('../services/blogReadService');
const queryAsync = util.promisify(pool2.query).bind(pool2);

async function explainOne(label, sql, params) {
  console.log(`\n=== ${label} ===\n${sql}\n-- params: ${JSON.stringify(params)}\n`);
  try {
    const rows = await queryAsync(`EXPLAIN ${sql}`, params);
    console.table(rows);
  } catch (err) {
    console.error(`EXPLAIN failed (${label}):`, err.message);
  }
}

async function main() {
  await detectFulltextIndex();
  const fx = explainQueryFixtures();
  await explainOne('listing', fx.listing.sql, fx.listing.params);
  await explainOne('detail_by_slug', fx.detail.sql, fx.detail.params);
  await explainOne('recent', fx.recent.sql, fx.recent.params);
  await explainOne('related_by_category', fx.related.sql, fx.related.params);
  await explainOne('search_like', fx.searchLike.sql, fx.searchLike.params);
  await explainOne('search_fulltext', fx.searchFulltext.sql, fx.searchFulltext.params);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
