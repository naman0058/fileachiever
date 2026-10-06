#!/usr/bin/env node
'use strict';

/**
 * Idempotent column migration for blog editorial / AEO fields.
 * Usage: node scripts/run-automate-blog-content-model.js
 */

require('dotenv').config();
const util = require('util');
const pool2 = require('../routes/pool2');
const queryAsync = util.promisify(pool2.query).bind(pool2);

async function columnExists(name) {
  const rows = await queryAsync(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'blogs' AND COLUMN_NAME = ?`,
    [name]
  );
  return rows.length > 0;
}

async function mysqlSupportsJson() {
  try {
    const rows = await queryAsync('SELECT VERSION() AS v');
    const v = String(rows[0]?.v || '');
    const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!m) return true;
    const major = parseInt(m[1], 10);
    const minor = parseInt(m[2], 10);
    const patch = parseInt(m[3], 10);
    if (major > 5) return true;
    if (major === 5 && minor > 7) return true;
    if (major === 5 && minor === 7 && patch >= 8) return true;
    return false;
  } catch (_) {
    return false;
  }
}

async function addColumn(name, sql) {
  if (await columnExists(name)) {
    console.log(`reuse: column ${name}`);
    return;
  }
  try {
    await queryAsync(sql);
    console.log(`added: column ${name}`);
  } catch (err) {
    if (err && (err.code === 'ER_DUP_FIELDNAME' || err.errno === 1060)) {
      console.log(`reuse: column ${name}`);
      return;
    }
    throw err;
  }
}

async function main() {
  const jsonType = (await mysqlSupportsJson()) ? 'JSON' : 'LONGTEXT';
  console.log(`JSON columns: using ${jsonType}`);

  await addColumn(
    'language_code',
    "ALTER TABLE `blogs` ADD COLUMN `language_code` VARCHAR(10) NOT NULL DEFAULT 'en-US'"
  );
  await addColumn(
    'target_country',
    "ALTER TABLE `blogs` ADD COLUMN `target_country` CHAR(2) NOT NULL DEFAULT 'US'"
  );
  await addColumn('answer_summary', 'ALTER TABLE `blogs` ADD COLUMN `answer_summary` TEXT NULL');
  await addColumn(
    'key_takeaways',
    `ALTER TABLE \`blogs\` ADD COLUMN \`key_takeaways\` ${jsonType} NULL`
  );
  await addColumn(
    'entities_json',
    `ALTER TABLE \`blogs\` ADD COLUMN \`entities_json\` ${jsonType} NULL`
  );
  await addColumn(
    'sources_json',
    `ALTER TABLE \`blogs\` ADD COLUMN \`sources_json\` ${jsonType} NULL`
  );
  await addColumn('reviewed_at', 'ALTER TABLE `blogs` ADD COLUMN `reviewed_at` DATETIME NULL');

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
