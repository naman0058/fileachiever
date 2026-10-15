'use strict';

const assert = require('assert');
const { RISK_ORDER } = require('../utils/freelancingDeliveryRisk');
const analytics = require('../services/freelancingAnalyticsService');

function csvEscape(val) {
  const s = val == null ? '' : String(val);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

assert.strictEqual(csvEscape('plain'), 'plain');
assert.strictEqual(csvEscape('a,b'), '"a,b"');

assert(RISK_ORDER.includes('overdue_delivery'));
assert(RISK_ORDER.includes('on_track'));

(async () => {
  const risk = await analytics.getDeliveryRiskCounts({});
  assert.ok(risk.buckets);
  assert.ok(typeof risk.total_active === 'number');
  assert.ok(risk.exclusive === true);
  console.log('OK getDeliveryRiskCounts shape');

  const bundle = await analytics.getAnalyticsBundle({
    from: '2020-01-01',
    to: '2030-12-31',
    trend_days: 7,
  });
  assert.ok(bundle.definitions.financial_range.date_field === 'created_at');
  assert.ok(Array.isArray(bundle.financialSeries));
  assert.ok(bundle.conversion);
  console.log('OK getAnalyticsBundle');

  const csv = await analytics.exportCsv('financial', { from: '2020-01-01', to: '2030-01-01' });
  assert.ok(csv.includes('month,leads_count'));
  console.log('OK exportCsv');

  console.log('All freelancing analytics tests passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
