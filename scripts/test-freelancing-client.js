'use strict';

const assert = require('assert');
const {
  canTransitionDependencyStatus,
  isOpenClientDependency,
  normalizeDependencyType,
  dependencyLabel,
} = require('../utils/freelancingClientDeps');

function test(name, fn) {
  try {
    fn();
    console.log('OK', name);
  } catch (e) {
    console.error('FAIL', name, e.message);
    process.exitCode = 1;
  }
}

test('normalize waiting_info legacy', () => {
  assert.strictEqual(normalizeDependencyType('waiting_info'), 'waiting_project_requirements');
});

test('resolved dependency not open in queue', () => {
  assert.strictEqual(isOpenClientDependency({ client_dependency: 'none', client_dependency_status: 'resolved' }), false);
});

test('open dependency stays when stage changes conceptually', () => {
  assert.strictEqual(
    isOpenClientDependency({ client_dependency: 'waiting_files', client_dependency_status: 'open', delivery_stage: 'delivered' }),
    true
  );
});

test('lifecycle transition open to scheduled', () => {
  assert.strictEqual(canTransitionDependencyStatus('open', 'follow_up_schedured'), false);
  assert.strictEqual(canTransitionDependencyStatus('open', 'follow_up_scheduled'), true);
});

test('dependency labels', () => {
  assert.ok(dependencyLabel('waiting_clarification').includes('clarification'));
});

if (process.exitCode) process.exit(process.exitCode);
console.log('All freelancing client unit tests passed.');
