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

// 1. pending slot — no collapse class
const pending = mockWrapper();
assert.strictEqual(applyManualAdSlotStatusClass(pending, ''), false);
assert.strictEqual(applyManualAdSlotStatusClass(pending, null), false);
assert.strictEqual(pending._classes.size, 0);

// 2. filled slot
const filled = mockWrapper();
assert.strictEqual(applyManualAdSlotStatusClass(filled, 'filled'), true);
assert.ok(filled._classes.has(WRAPPER_CLASS_FILLED));
assert.ok(!filled._classes.has(WRAPPER_CLASS_UNFILLED));

// 3. unfilled slot
const unfilled = mockWrapper();
assert.strictEqual(applyManualAdSlotStatusClass(unfilled, 'unfilled'), true);
assert.ok(unfilled._classes.has(WRAPPER_CLASS_UNFILLED));
assert.ok(!unfilled._classes.has(WRAPPER_CLASS_FILLED));

// 4. multiple manual slots — independent wrappers
const slotA = mockWrapper();
const slotB = mockWrapper();
applyManualAdSlotStatusClass(slotA, 'unfilled');
applyManualAdSlotStatusClass(slotB, 'filled');
assert.ok(slotA._classes.has(WRAPPER_CLASS_UNFILLED));
assert.ok(slotB._classes.has(WRAPPER_CLASS_FILLED));

const css = fs.readFileSync(path.join(__dirname, '../public/css/blog-adsense.css'), 'utf8');
assert.ok(css.includes('.fm-blog-ad-slot.fm-blog-ad-slot--unfilled .fm-blog-ad-label'));
assert.ok(css.includes('min-height: 0'));
assert.ok(css.includes('data-ad-status="unfilled"'));

// 5. Auto Ads — collapse rules scoped under .fm-blog-ad-slot only
assert.ok(css.includes('.fm-blog-ad-slot.fm-blog-ad-slot--unfilled .fm-blog-ad-slot__reserve ins.adsbygoogle'));
assert.ok(!css.includes('body ins.adsbygoogle'));

const js = fs.readFileSync(path.join(__dirname, '../public/js/blog-adsense.js'), 'utf8');
assert.ok(js.includes("ins.closest('.fm-blog-ad-slot')"));
assert.ok(js.includes('attributeFilter: [\'data-ad-status\']'));
assert.ok(js.includes('mo.disconnect()'));
assert.ok(!js.includes('setInterval'));

console.log('test-blog-ad-unfilled-collapse: OK');
process.exit(0);
