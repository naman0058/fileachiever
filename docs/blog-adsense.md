# Blog AdSense (manual placements)

Ads load **only** on `/blog` and `/blog/:slug` when enabled and at least one ad slot ID is configured.

## Configure (production `.env`)

```env
ADSENSE_ENABLED=1
ADSENSE_CLIENT_ID=ca-pub-7230981653683251
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
