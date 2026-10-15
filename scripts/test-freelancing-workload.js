'use strict';

const assert = require('assert');
const {
  effortPointsForLead,
  utilization,
  loadStatus,
  suggestAgentsForWork,
} = require('../utils/freelancingWorkload');

function test(name, fn) {
  try {
    fn();
    console.log('OK', name);
  } catch (e) {
    console.error('FAIL', name, e.message);
    process.exitCode = 1;
  }
}

test('effort uses explicit points', () => {
  assert.strictEqual(effortPointsForLead({ estimated_effort_points: 12, priority: 'low' }), 12);
});

test('utilization from points', () => {
  const u = utilization(20, 40);
  assert.strictEqual(u.pct, 50);
});

test('load status thresholds', () => {
  assert.strictEqual(loadStatus(40), 'available');
  assert.strictEqual(loadStatus(90), 'high_load');
  assert.strictEqual(loadStatus(110), 'overloaded');
});

test('suggest agents deterministic order', () => {
  const work = { priority: 'medium' };
  const agents = [
    { agent_name: 'B', active_tasks: 2, overdue_tasks: 0, utilization_pct: 80, assigned_effort_points: 32, capacity_points: 40, load_status: 'normal' },
    { agent_name: 'A', active_tasks: 1, overdue_tasks: 0, utilization_pct: 30, assigned_effort_points: 12, capacity_points: 40, load_status: 'available', available_capacity_points: 28 },
  ];
  const s = suggestAgentsForWork(work, agents, 2);
  assert.strictEqual(s[0].agent_name, 'A');
});

if (process.exitCode) process.exit(process.exitCode);
console.log('All freelancing workload unit tests passed.');
