# Blog AdSense (manual placements)

Ads load **only** on `/blog` and `/blog/:slug` when enabled and at least one ad slot ID is configured.

## Site verification (AdSense dashboard)

1. **Recommended:** Verify with **ads.txt** — live at `https://www.filemakr.com/ads.txt` (no ad code on homepage).
2. **Code snippet method:** Google checks `filemakr.com` (homepage). Blog-only snippet is on `/blog` and `/blog/:slug`. Either:
   - Verify using **ads.txt**, or
   - Set `ADSENSE_VERIFY_HOMEPAGE=1` (loads meta + script on home **only**, no ad units), deploy, click Verify, then set back to `0` if desired.

Loader + meta on blog require:

```env
ADSENSE_ENABLED=1
ADSENSE_CLIENT_ID=ca-pub-7230981653683251
```

Ad **units** additionally need slot IDs:

```env
ADSENSE_SLOT_BLOG_DISPLAY=YOUR_SLOT_ID
```

Or set per placement: `ADSENSE_SLOT_BLOG_AFTER_INTRO`, `ADSENSE_SLOT_BLOG_MID_1`, `ADSENSE_SLOT_BLOG_MID_2`, `ADSENSE_SLOT_BLOG_END`, `ADSENSE_SLOT_BLOG_LISTING_1`, `ADSENSE_SLOT_BLOG_LISTING_2`.

## ads.txt

Served at `/ads.txt` from `routes/ads.js` using the configured publisher ID.

## GTM

If AdSense is also tagged in GTM, disable duplicate in-content units on blog URLs in GTM or AdSense Auto Ads to avoid overcrowding.

## Test

```bash
node scripts/test-blog-adsense.js
```
