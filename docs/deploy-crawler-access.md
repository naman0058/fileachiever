# Crawler access (robots.txt vs infrastructure)

`robots.txt` only tells well-behaved crawlers what they *may* request. It does **not** grant access if the edge or origin returns **403/Challenge**.

## Blog discovery URLs

- `https://www.filemakr.com/robots.txt`
- `https://www.filemakr.com/sitemap.xml` (site catalog; blog posts are not duplicated here)
- `https://www.filemakr.com/blog-sitemap.xml` (published blog posts only)
- `https://www.filemakr.com/blog/feed.xml` (RSS)
- `https://www.filemakr.com/sitemap-news.xml` (recent updates)

Search result pages (`/blog?q=…`) stay **crawlable** so bots can read **`noindex`** in HTML. Do **not** block `/blog?q=` in robots.txt.

## Allow legitimate bots at the firewall

Ensure Cloudflare (or similar) **does not** block:

- `Googlebot`, `Bingbot`
- `OAI-SearchBot` (OpenAI search)
- `PerplexityBot` (unless a deliberate business policy says otherwise—`robots.txt` currently allows it)

Bot Fight Mode, aggressive WAF rules, or country blocks can cause soft indexing failures even when robots.txt is correct.

## IndexNow

- Set `INDEXNOW_KEY` (8–128 chars, `[a-zA-Z0-9-]`) in production `.env`
- Verification file: `https://www.filemakr.com/{INDEXNOW_KEY}.txt` (body = key only)
- Submissions are queued on blog publish/update/unpublish; failures are logged and do not block saves
- Manual submit (admin session): `POST /blog-admin/indexnow/submit` with `slug`
- Manual submit (writer): `POST /blog-writer/api/indexnow` with `slug`

This is **not** Google’s Indexing API and does not guarantee instant ranking or indexing.
