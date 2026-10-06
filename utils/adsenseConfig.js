'use strict';

/**
 * Central AdSense config (blog routes only). Slot IDs from AdSense dashboard via env.
 */

const DEFAULT_CLIENT = 'ca-pub-7230981653683251';

function envBool(name, defaultVal) {
  const v = process.env[name];
  if (v == null || v === '') return defaultVal;
  return v === '1' || v === 'true' || v === 'yes';
}

function slotEnv(name) {
  const v = String(process.env[name] || '').trim();
  return v || null;
}

function getAdsenseConfig() {
  const clientId = String(process.env.ADSENSE_CLIENT_ID || DEFAULT_CLIENT).trim();
  const enabled =
    envBool('ADSENSE_ENABLED', process.env.NODE_ENV === 'production') &&
    /^ca-pub-\d+$/.test(clientId);

  const slots = {
    after_intro: slotEnv('ADSENSE_SLOT_BLOG_AFTER_INTRO'),
    mid_content_1: slotEnv('ADSENSE_SLOT_BLOG_MID_1'),
    mid_content_2: slotEnv('ADSENSE_SLOT_BLOG_MID_2'),
    end_content: slotEnv('ADSENSE_SLOT_BLOG_END'),
    listing_1: slotEnv('ADSENSE_SLOT_BLOG_LISTING_1'),
    listing_2: slotEnv('ADSENSE_SLOT_BLOG_LISTING_2'),
  };

  /** Fallback: one shared display unit for all in-article positions */
  const shared = slotEnv('ADSENSE_SLOT_BLOG_DISPLAY');
  if (shared) {
    for (const k of Object.keys(slots)) {
      if (!slots[k]) slots[k] = shared;
    }
  }

  const thresholds = {
    minWordsAfterIntro: Number(process.env.ADSENSE_MIN_WORDS_AFTER_INTRO) || 250,
    minWordsMid1: Number(process.env.ADSENSE_MIN_WORDS_MID_1) || 800,
    minWordsMid2: Number(process.env.ADSENSE_MIN_WORDS_MID_2) || 1500,
    minWordsEnd: Number(process.env.ADSENSE_MIN_WORDS_END) || 600,
    mid1Progress: Number(process.env.ADSENSE_MID1_PROGRESS) || 0.4,
    mid2Progress: Number(process.env.ADSENSE_MID2_PROGRESS) || 0.7,
    listingSecondAfterCard: Number(process.env.ADSENSE_LISTING_SECOND_AFTER) || 12,
  };

  const hasAnySlot = Object.values(slots).some(Boolean);
  const clientOk = /^ca-pub-\d+$/.test(clientId);
  /** Meta + loader script (AdSense site verification / account link) */
  const verifySnippet = enabled && clientOk;
  /** Manual <ins> ad units on blog only */
  const showAdUnits = verifySnippet && hasAnySlot;
  /**
   * Google often verifies filemakr.com from the homepage. Default off — use ads.txt
   * verification, or set ADSENSE_VERIFY_HOMEPAGE=1 (loader only, no ad units on home).
   */
  const verifyHomepage = envBool('ADSENSE_VERIFY_HOMEPAGE', false) && verifySnippet;

  return {
    verifySnippet,
    showAdUnits,
    verifyHomepage,
    /** @deprecated use showAdUnits */
    enabled: showAdUnits,
    clientId,
    slots,
    thresholds,
    hasAnySlot,
    adsTxtLine: `google.com, ${clientId.replace('ca-pub-', 'pub-')}, DIRECT, f08c47fec0942fa0`,
  };
}

module.exports = { getAdsenseConfig, DEFAULT_CLIENT };
