# Blog performance (`/blog`, `/blog/:slug`)

## Engineering targets (lab / fast mobile)

- LCP ≤ ~1.5s on representative pages (not guaranteed in production)
- Low TTFB via lean SQL + in-memory read cache (`blogReadService.js`)
- Minimal layout shift (explicit image dimensions on cards/hero)
- Blog shell uses **lite** header/footer assets (no owl/slick/select2/AOS on blog routes)

## Measure locally

With the app running (default port from `bin/www`):

```bash
node scripts/measure-blog-performance.js
```

Optional Lighthouse (Chrome required):

```bash
npx lighthouse http://localhost:3000/blog --only-categories=performance --preset=desktop --output=json --output-path=./tmp/lighthouse-blog.json
npx lighthouse http://localhost:3000/blog/YOUR-SLUG --only-categories=performance --preset=perf --output=json --output-path=./tmp/lighthouse-blog-detail.json
```

## Server

- `compression` enabled globally in `app.js`
- Public blog HTML: `middleware/blogPublicCache.js` (`Cache-Control: public, max-age=30, stale-while-revalidate=120`)
- Blog API JSON: `Cache-Control: public, max-age=60` on `/api/blog/:slug`
- Listing/detail queries: lean column lists, composite indexes (see `migrations/automate_blog_read_performance.sql`)

## Frontend

- `active: 'blog'` → lite CSS/JS path in `navbar.ejs` / `footer.ejs`
- No `projectReport.ejs` on blog templates (removed heavy fonts/CSS)
- Cloudinary helper loaded once from navbar (`defer`)
- Hero: `fetchpriority="high"`, no lazy-load; optional `<link rel="preload" as="image">` via `Metatags.lcpPreloadImage`

## Ads / third party

- GTM remains in head (business/analytics/AdSense via tag manager)
- Meta Pixel deferred via `analytics-deferred.ejs` (`requestIdleCallback`)
- Do not add duplicate AdSense script tags in blog templates

## Performance budgets (automated)

With the server running:

```bash
node scripts/test-blog-performance-budget.js
```

Override via env: `BLOG_BUDGET_LIST_TTFB_MS`, `BLOG_BUDGET_DETAIL_TTFB_MS`, `BLOG_BUDGET_LIST_KIB`, `BLOG_BUDGET_DETAIL_KIB`.

Example local baseline (warm cache, single Node process): `/blog` ~200–400ms TTFB, ~85–95 KiB HTML; search slightly smaller when fewer cards match.

## Regression checks

```bash
node scripts/test-blog-read-smoke.js
node scripts/measure-blog-performance.js
node scripts/test-blog-performance-budget.js
```

Verify: listing, detail, `?q=` search, 404 slug — no horizontal overflow, SEO head intact, article body in HTML source.
