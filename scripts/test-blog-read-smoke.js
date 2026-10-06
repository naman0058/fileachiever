#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  explainQueryFixtures,
  invalidateBlogReadCache,
  LIST_SELECT,
  DETAIL_SELECT,
} = require('../services/blogReadService');

const fx = explainQueryFixtures();
assert.ok(fx.listing.sql.includes('FROM blogs'));
assert.ok(!fx.listing.sql.match(/SELECT\s+\*\s+FROM/i));
assert.ok(fx.detail.sql.includes('slug = ?'));
assert.ok(fx.detail.sql.includes('LIMIT 1'));
assert.ok(fx.detail.sql.includes('content'));
assert.ok(!fx.listing.sql.includes('content'));
assert.ok(!fx.listing.sql.includes('schema_markup'));
assert.ok(DETAIL_SELECT.includes('schema_markup'));
assert.ok(!LIST_SELECT.includes('schema_markup'));

invalidateBlogReadCache();

console.log('blog-read-smoke: OK');
process.exit(0);
