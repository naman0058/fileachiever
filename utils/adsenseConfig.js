'use strict';

/**
 * Central AdSense config (blog routes only). Slot IDs from AdSense dashboard via env.
 */

const DEFAULT_CLIENT = 'ca-pub-7230981653683251';

const PLACEHOLDER_SLOT_RE =
  /paste|placeholder|your_|xxx|todo|example\.com|slot_id|change.?me/i;

function envBool(name, defaultVal) {
  const v = process.env[name];
  if (v == null || v === '') return defaultVal;
  return v === '1' || v === 'true' || v === 'yes';
}

/** AdSense display unit IDs are numeric (typically 10 digits). */
function normalizeSlotId(raw) {
  const s = String(raw || '').trim();
  if (!s || PLACEHOLDER_SLOT_RE.test(s)) return null;
  if (!/^\d{8,16}$/.test(s)) return null;
  return s;
}

function slotEnv(name) {
  return normalizeSlotId(process.env[name]);
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

  /** Optional single unit fallback for unfilled article slots only (not preferred for reporting). */
  const shared = slotEnv('ADSENSE_SLOT_BLOG_DISPLAY');
  if (shared) {
    for (const k of ['after_intro', 'mid_content_1', 'mid_content_2', 'end_content']) {
      if (!slots[k]) slots[k] = shared;
    }
  }

  /** Listing: reuse end → after_intro → any configured article slot */
  if (!slots.listing_1) {
    slots.listing_1 =
      slots.end_content ||
      slots.after_intro ||
      slots.mid_content_1 ||
      slots.mid_content_2 ||
      shared ||
      null;
  }
  if (!slots.listing_2) {
    slots.listing_2 = slots.listing_1;
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
  const verifySnippet = enabled && clientOk;
  const showAdUnits = verifySnippet && hasAnySlot;
  const verifyHomepage = envBool('ADSENSE_VERIFY_HOMEPAGE', false) && verifySnippet;
  const debugMode =
    envBool('ADSENSE_DEBUG', false) && String(process.env.NODE_ENV || '').toLowerCase() !== 'production';

  return {
    verifySnippet,
    showAdUnits,
    verifyHomepage,
    debugMode,
    enabled: showAdUnits,
    clientId,
    slots,
    thresholds,
    hasAnySlot,
    adsTxtLine: `google.com, ${clientId.replace('ca-pub-', 'pub-')}, DIRECT, f08c47fec0942fa0`,
  };
}

module.exports = { getAdsenseConfig, DEFAULT_CLIENT, normalizeSlotId };
