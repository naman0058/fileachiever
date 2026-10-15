'use strict';

/**
 * Validates the documented delivery lifecycle as stage transitions (unit level).
 * Full UI/API E2E requires authenticated browser session — see docs/FREELANCING_PRODUCTION_READINESS.md.
 */

const assert = require('assert');
const { canTransitionStage } = require('../utils/freelancingOpsMap');

function ok(name, fn) {
  try {
    fn();
    console.log('OK', name);
  } catch (e) {
    console.error('FAIL', name, e.message);
    process.exitCode = 1;
  }
}

const EXECUTION_PATH = [
  ['unassigned', 'assigned'],
  ['assigned', 'in_progress'],
  ['in_progress', 'internal_review'],
  ['internal_review', 'client_review'],
  ['client_review', 'revision_required'],
  ['revision_required', 'in_progress'],
  ['in_progress', 'ready_for_delivery'],
  ['ready_for_delivery', 'delivered'],
  ['delivered', 'closed'],
];

ok('execution path transitions allowed', () => {
  EXECUTION_PATH.forEach(([from, to]) => {
    assert.strictEqual(
      canTransitionStage(from, to, { hasAssign: true }),
      true,
      `expected ${from} -> ${to}`
    );
  });
});

ok('cannot skip to delivered from assigned without force', () => {
  assert.strictEqual(canTransitionStage('assigned', 'delivered', { hasAssign: true }), false);
});

ok('force allows exceptional transition', () => {
  assert.strictEqual(canTransitionStage('assigned', 'delivered', { hasAssign: true, force: true }), true);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('All freelancing workflow unit tests passed.');
