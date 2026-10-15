'use strict';

const assert = require('assert');
const { classifyDeliveryRisk, summarizeDeliveryRisk } = require('../utils/freelancingDeliveryRisk');
const { deliveryEventForStage } = require('../utils/freelancingDeliveryEvents');

function test(name, fn) {
  try {
    fn();
    console.log('OK', name);
  } catch (e) {
    console.error('FAIL', name, e.message);
    process.exitCode = 1;
  }
}

test('deliveryEventForStage delivered', () => {
  assert.strictEqual(deliveryEventForStage('delivered'), 'delivered');
});

test('classifyDeliveryRisk exclusive overdue', () => {
  const lead = {
    deadline: '2000-01-01',
    status: 'in_progress',
    is_project_done: 0,
    assign: 'a',
    delivery_stage: 'in_progress',
    blocker_reason: 'x',
  };
  assert.strictEqual(classifyDeliveryRisk(lead), 'overdue_delivery');
});

test('summarizeDeliveryRisk counts once per row', () => {
  const s = summarizeDeliveryRisk([
    { deadline: '2000-01-01', status: 'in_progress', is_project_done: 0, assign: 'a', delivery_stage: 'in_progress' },
    { deadline: '2099-01-01', status: 'in_progress', is_project_done: 0, assign: 'a', delivery_stage: 'ready_for_delivery' },
  ]);
  assert.strictEqual(s.total_active, 2);
  assert.strictEqual(s.buckets.overdue_delivery, 1);
  assert.strictEqual(s.buckets.ready_not_delivered, 1);
});

if (process.exitCode) process.exit(process.exitCode);
console.log('All freelancing delivery unit tests passed.');
