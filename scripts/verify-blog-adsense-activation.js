#!/usr/bin/env node
'use strict';

/**
 * Prints MANUAL ADS ACTIVATION report from current process env (load dotenv first if needed).
 * Usage: node -r dotenv/config scripts/verify-blog-adsense-activation.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { getAdsenseConfig } = require('../utils/adsenseConfig');
const {
  getBlogAdPlacements,
  injectBlogContentAdMarkers,
  countArticleWords,
} = require('../utils/blogArticleAds');

const cfg = getAdsenseConfig();
const s = cfg.slots;

function slotStatus(key) {
  return s[key] ? 'ACTIVE' : 'INACTIVE';
}

function renderInsCheck(position) {
  if (!s[position]) return false;
  const partialPath = path.join(__dirname, '../views/partials/blog-ad-slot.ejs');
  const html = ejs.render(
    fs.readFileSync(partialPath, 'utf8'),
    {
      fmAdsense: cfg,
      adPosition: position,
      blogAdPlacements: getBlogAdPlacements(2500),
    },
    { filename: partialPath }
  );
  return (
    html.includes('class="adsbygoogle"') &&
    html.includes(`data-ad-client="${cfg.clientId}"`) &&
    html.includes(`data-ad-slot="${s[position]}"`)
  );
}

const placementsOk = {
  after_intro: renderInsCheck('after_intro'),
  mid_content_1: false,
  mid_content_2: false,
  end_content: renderInsCheck('end_content'),
  listing_1: renderInsCheck('listing_1'),
};

const midPartial = path.join(__dirname, '../views/partials/blog-ad-slot.ejs');
for (const pos of ['mid_content_1', 'mid_content_2']) {
  if (!s[pos]) continue;
  const html = ejs.render(
    fs.readFileSync(midPartial, 'utf8'),
    { fmAdsense: cfg, adPosition: pos, blogAdPlacements: getBlogAdPlacements(2500) },
    { filename: midPartial }
  );
  placementsOk[pos] = html.includes(`data-ad-slot="${s[pos]}"`);
}

const verifyHead = fs.readFileSync(
  path.join(__dirname, '../views/partials/adsense-verify-head.ejs'),
  'utf8'
);
const scriptLoads = (verifyHead.match(/adsbygoogle\.js/g) || []).length;

const faqSample =
  '<p>' +
  'word '.repeat(1200) +
  '</p><h2>FAQ</h2><h3>Q?</h3><p>A.</p><h2>Conclusion</h2><p>done.</p>';
const faqHtml = injectBlogContentAdMarkers(faqSample, countArticleWords(faqSample));
const faqIdx = faqHtml.indexOf('<h2>FAQ</h2>');
const faqProtection =
  faqIdx >= 0 && faqHtml.indexOf('data-fm-ad-mount', faqIdx) === -1 ? 'PASSED' : 'FAILED';

console.log(`
MANUAL ADS ACTIVATION

Publisher ID: ${cfg.clientId}
After Intro Slot: ${s.after_intro || '(empty)'}
Mid 40 Slot: ${s.mid_content_1 || '(empty)'}
Mid 70 Slot: ${s.mid_content_2 || '(empty)'}
End Slot: ${s.end_content || '(empty)'}
Listing Slot: ${s.listing_1 || '(empty)'}

showAdUnits: ${cfg.showAdUnits ? 'ACTIVE' : 'INACTIVE'}

After Intro: ${cfg.showAdUnits && placementsOk.after_intro ? 'ACTIVE' : 'INACTIVE'}
Mid 40: ${cfg.showAdUnits && placementsOk.mid_content_1 ? 'ACTIVE' : 'INACTIVE'}
Mid 70: ${cfg.showAdUnits && placementsOk.mid_content_2 ? 'ACTIVE' : 'INACTIVE'}
End: ${cfg.showAdUnits && placementsOk.end_content ? 'ACTIVE' : 'INACTIVE'}
Blog Listing: ${cfg.showAdUnits && placementsOk.listing_1 ? 'ACTIVE' : 'INACTIVE'}

FAQ Protection: ${faqProtection}

AdSense Script: ${scriptLoads === 1 ? 'SINGLE' : scriptLoads > 1 ? 'DUPLICATED' : 'MISSING'}
GTM Verification: EXTERNAL CHECK REQUIRED

Environment variables required in production:
ADSENSE_ENABLED, ADSENSE_CLIENT_ID, ADSENSE_SLOT_BLOG_AFTER_INTRO, ADSENSE_SLOT_BLOG_MID_1, ADSENSE_SLOT_BLOG_MID_2, ADSENSE_SLOT_BLOG_END, ADSENSE_SLOT_BLOG_LISTING_1, ADSENSE_SLOT_BLOG_LISTING_2, ADSENSE_SLOT_BLOG_DISPLAY (optional fallback), ADSENSE_VERIFY_HOMEPAGE (optional), ADSENSE_DEBUG (local only)

Manual Ads: ${cfg.showAdUnits && s.after_intro && s.mid_content_1 && s.mid_content_2 && s.end_content ? 'FULLY IMPLEMENTED' : 'STILL PARTIAL'}
`.trim());

process.exit(cfg.showAdUnits ? 0 : 2);
