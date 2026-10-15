'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const scripts = [
  'test-freelancing-ops.js',
  'test-freelancing-delivery.js',
  'test-freelancing-client.js',
  'test-freelancing-workload.js',
  'test-freelancing-finance.js',
  'test-freelancing-analytics.js',
  'test-freelancing-workflow.js',
];

let failed = 0;
for (const file of scripts) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], {
    cwd: root,
    stdio: 'inherit',
  });
  if (r.status !== 0) failed += 1;
}

if (failed) {
  console.error(`\n${failed} freelancing test script(s) failed.`);
  process.exit(1);
}
console.log('\nAll freelancing test scripts passed.');
