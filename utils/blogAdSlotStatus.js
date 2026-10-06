'use strict';

/** Google sets data-ad-status on <ins class="adsbygoogle"> when processing completes. */
const FINAL_MANUAL_AD_STATUSES = new Set(['filled', 'unfilled']);

const WRAPPER_CLASS_FILLED = 'fm-blog-ad-slot--filled';
const WRAPPER_CLASS_UNFILLED = 'fm-blog-ad-slot--unfilled';

/**
 * Apply visual state classes on FileMakr manual wrapper (.fm-blog-ad-slot).
 * @param {{ classList?: { add: Function, remove: Function } } | null} wrapper
 * @param {string | null | undefined} status
 * @returns {boolean} true when status is final (observer can disconnect)
 */
function applyManualAdSlotStatusClass(wrapper, status) {
  const st = String(status || '').trim().toLowerCase();
  if (!wrapper || !wrapper.classList || !FINAL_MANUAL_AD_STATUSES.has(st)) {
    return false;
  }
  if (st === 'unfilled') {
    wrapper.classList.add(WRAPPER_CLASS_UNFILLED);
    wrapper.classList.remove(WRAPPER_CLASS_FILLED);
  } else {
    wrapper.classList.add(WRAPPER_CLASS_FILLED);
    wrapper.classList.remove(WRAPPER_CLASS_UNFILLED);
  }
  return true;
}

module.exports = {
  FINAL_MANUAL_AD_STATUSES,
  WRAPPER_CLASS_FILLED,
  WRAPPER_CLASS_UNFILLED,
  applyManualAdSlotStatusClass,
};
