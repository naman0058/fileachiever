#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { applyManualAdSlotStatusClass, WRAPPER_CLASS_UNFILLED, WRAPPER_CLASS_FILLED } =
  require('../utils/blogAdSlotStatus');

function mockWrapper() {
  const classes = new Set();
  return {
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
    },
    _classes: classes,
  };
}

const w = mockWrapper();
assert.strictEqual(applyManualAdSlotStatusClass(w, 'pending'), false);
assert.strictEqual(w._classes.size, 0);

applyManualAdSlotStatusClass(w, 'unfilled');
assert.ok(w._classes.has(WRAPPER_CLASS_UNFILLED));
assert.ok(!w._classes.has(WRAPPER_CLASS_FILLED));

applyManualAdSlotStatusClass(w, 'filled');
assert.ok(w._classes.has(WRAPPER_CLASS_FILLED));
assert.ok(!w._classes.has(WRAPPER_CLASS_UNFILLED));

const css = fs.readFileSync(path.join(__dirname, '../public/css/blog-adsense.css'), 'utf8');
assert.ok(css.includes('.fm-blog-ad-slot.fm-blog-ad-slot--unfilled'));
assert.ok(css.includes('data-ad-status="unfilled"'));
assert.ok(!css.includes('.adsbygoogle:not([data-ad-status'));

const js = fs.readFileSync(path.join(__dirname, '../public/js/blog-adsense.js'), 'utf8');
assert.ok(js.includes('data-ad-status'));
assert.ok(js.includes('MutationObserver'));
assert.ok(js.includes('.fm-blog-ad-slot ins.adsbygoogle'));
assert.ok(!js.includes('setInterval'));

console.log('test-blog-ad-unfilled-collapse: OK');
process.exit(0);
