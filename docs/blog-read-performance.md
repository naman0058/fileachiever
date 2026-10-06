# Blog read performance (automate_blog.blogs)

## Migrations

1. Check duplicate slugs (non-destructive): `node scripts/blog-check-duplicate-slugs.js`
2. Apply indexes idempotently: `node scripts/run-automate-blog-read-performance.js`
3. After zero duplicates: `node scripts/run-automate-blog-read-performance.js --add-unique-slug`

Reference SQL (manual): `migrations/automate_blog_read_performance.sql`

## EXPLAIN

With DB credentials in `.env`:

```bash
node scripts/explain-blog-queries.js
```

MySQL 8.0.18+ also supports:

```sql
EXPLAIN ANALYZE SELECT ... ;
```

Use the same SQL strings from `services/blogReadService.js` → `explainQueryFixtures()`.

## Indexes

| Index | Purpose |
|-------|---------|
| `idx_status`, `idx_author` | Legacy (single-column) |
| `idx_blogs_slug` | Slug lookups; becomes `uq_blogs_slug` when safe |
| `idx_blogs_status_created_id` | Listing / recent (status + sort) |
| `idx_blogs_cat_status_created` | Category filter + related posts |
| `idx_blogs_author_status_created` | Author-scoped lists |
| `idx_blogs_status_updated` | Freshness / sitemap-style ordering |
| `ft_blog_search` | FULLTEXT on title, meta_abstract, tags, meta_keywords |

## Cache

In-memory TTL cache in `blogReadService.js`. Env:

- `BLOG_READ_CACHE_MS` (listing, default 120000)
- `BLOG_POPULAR_CACHE_MS` (default 300000)
- `BLOG_DETAIL_CACHE_MS` (default 180000)
- `BLOG_USE_FULLTEXT=0` to force LIKE search fallback

Invalidated on blog writer save/update via `invalidateBlogReadCache()`.
