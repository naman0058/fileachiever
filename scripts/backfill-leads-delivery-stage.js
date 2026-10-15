#!/usr/bin/env node
'use strict';

/**
 * Set leads.delivery_stage where NULL using deriveDeliveryStage (idempotent).
 * Usage: node scripts/backfill-leads-delivery-stage.js
 */
require('dotenv').config();
const util = require('util');
const pool = require('../routes/pool');
const { deriveDeliveryStage } = require('../utils/freelancingOpsMap');

const queryAsync = util.promisify(pool.query).bind(pool);

async function main() {
  const cols = await queryAsync(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'delivery_stage'`
  );
  if (!cols.length) {
    console.log('Column delivery_stage missing — run migrations/freelancing_ops_workflow.sql first.');
    process.exit(1);
  }

  const rows = await queryAsync(
    `SELECT id, assign, status, is_project_done, is_payment_received, is_agent_payment_done, delivery_stage
     FROM leads WHERE delivery_stage IS NULL LIMIT 5000`
  );

  let updated = 0;
  for (const row of rows) {
    const stage = deriveDeliveryStage(row);
    await queryAsync(`UPDATE leads SET delivery_stage = ? WHERE id = ? AND delivery_stage IS NULL`, [stage, row.id]);
    updated += 1;
  }
  console.log(`Backfill complete: ${updated} row(s) updated.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
