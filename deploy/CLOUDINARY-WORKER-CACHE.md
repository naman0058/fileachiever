# Cloudflare Cloudinary Worker — cache + site-safe routes

## Emergency: website shows "Not found"
That means the Worker route is too broad (e.g. `www.filemakr.com/*`) and the
old worker returned `Not found` for non-cloudinary paths.

**Fix now:**
1. Paste latest [`cloudflare-cloudinary-worker.js`](./cloudflare-cloudinary-worker.js) → **Save and Deploy**
   - Non-`/cloudinary` traffic now **passes through to origin** (site works again)
2. Fix Routes (Workers → your worker → **Triggers** → **Routes**):

| Keep | Delete if present |
|---|---|
| `www.filemakr.com/cloudinary*` | `www.filemakr.com/*` |
| `filemakr.com/cloudinary*` | `filemakr.com/*` |
| | `*/*` |

## Cache (1 year, Cloudinary not hit on repeat)
Worker strips Cloudinary's `CDN-Cache-Control: no-store` and caches via Cache API.

Optional Cache Rule: Path starts with `/cloudinary` → Eligible for cache → Edge TTL 1 year.

## Verify
```bash
# Website must be 200 HTML (not plain "Not found")
curl -sI https://www.filemakr.com/

# Image 2nd hit: X-FM-Cache: HIT, X-FM-Origin: 0, X-FM-Proxy: cloudinary-worker/3
curl -sI "https://www.filemakr.com/cloudinary/dggf8vl9p/image/upload/f_auto,q_auto:best,w_64,c_limit/v1718627756/filemakr-project-file-creator-favicon_1_dqogst.avif"
```
