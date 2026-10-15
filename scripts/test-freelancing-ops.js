'use strict';

const assert = require('assert');
const {
  deriveDeliveryStage,
  isActiveWork,
  urgencyBucket,
  canTransitionStage,
  legacyStatusForStage,
  isLegacyExecutionStatus,
  computeIntelFlags,
  formatTimeRemaining,
} = require('../utils/freelancingOpsMap');

function test(name, fn) {
  try {
    fn();
    console.log('OK', name);
  } catch (e) {
    console.error('FAIL', name, e.message);
    process.exitCode = 1;
  }
}

test('deriveDeliveryStage unassigned without assign', () => {
  assert.strictEqual(deriveDeliveryStage({ assign: '', status: 'pending', is_project_done: 0 }), 'unassigned');
});

test('deriveDeliveryStage in_progress from status', () => {
  assert.strictEqual(
    deriveDeliveryStage({ assign: 'A', status: 'in_progress', is_project_done: 0 }),
    'in_progress'
  );
});

test('deriveDeliveryStage done -> ready_for_delivery', () => {
  assert.strictEqual(
    deriveDeliveryStage({ assign: 'A', status: 'in_progress', is_project_done: 1, is_payment_received: 0 }),
    'ready_for_delivery'
  );
});

test('isActiveWork excludes completed and done', () => {
  assert.strictEqual(isActiveWork({ status: 'completed', is_project_done: 0 }), false);
  assert.strictEqual(isActiveWork({ status: 'in_progress', is_project_done: 1, assign: 'x' }), false);
  assert.strictEqual(isActiveWork({ status: 'in_progress', is_project_done: 0, assign: 'x' }), true);
});

test('urgencyBucket overdue', () => {
  const lead = { status: 'in_progress', is_project_done: 0, assign: 'a', deadline: '2000-01-01' };
  assert.strictEqual(urgencyBucket(lead), 'overdue');
});

test('canTransitionStage blocks unassigned -> delivered', () => {
  assert.strictEqual(canTransitionStage('unassigned', 'delivered'), false);
  assert.strictEqual(canTransitionStage('in_progress', 'client_review'), true);
});

test('explicit delivery_stage respected', () => {
  assert.strictEqual(
    deriveDeliveryStage({ delivery_stage: 'client_review', status: 'pending', assign: 'a', is_project_done: 0 }),
    'client_review'
  );
});

test('legacyStatusForStage maps revision_required', () => {
  assert.strictEqual(legacyStatusForStage('revision_required'), 'in_changes');
});

test('canTransitionStage force bypasses graph', () => {
  assert.strictEqual(canTransitionStage('unassigned', 'delivered', { force: true }), true);
  assert.strictEqual(canTransitionStage('unassigned', 'delivered', { force: false }), false);
});

test('isLegacyExecutionStatus distinguishes agent names', () => {
  assert.strictEqual(isLegacyExecutionStatus('in_progress'), true);
  assert.strictEqual(isLegacyExecutionStatus('Jane Agent'), false);
});

test('computeIntelFlags never implies auto priority change', () => {
  const lead = {
    assign: '',
    priority_effective: 'critical',
    status: 'in_progress',
    is_project_done: 0,
    deadline: '2099-01-01',
    client_dependency: 'none',
  };
  const flags = computeIntelFlags(lead);
  assert.ok(flags.includes('unassigned_urgent'));
  assert.strictEqual(lead.priority_effective, 'critical');
});

test('formatTimeRemaining missing deadline', () => {
  const r = formatTimeRemaining({ deadline: null, status: 'in_progress', is_project_done: 0, assign: 'a' });
  assert.strictEqual(r.kind, 'missing');
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('All freelancing ops unit tests passed.');
