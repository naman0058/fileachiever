# Blog editorial content model

## Migration

```bash
node scripts/run-automate-blog-content-model.js
```

Adds nullable/default-safe columns on `automate_blog.blogs`. Existing posts unchanged.

## Fields

| Column | Purpose |
|--------|---------|
| `language_code` | BCP 47 editorial locale (default `en-US`) |
| `target_country` | ISO 3166-1 alpha-2 editorial audience (default `US`) |
| `answer_summary` | Optional direct answer (shown on detail page) |
| `key_takeaways` | JSON array, 3–7 items when used |
| `entities_json` | JSON array of entities discussed |
| `sources_json` | JSON array of real citations |
| `reviewed_at` | Set only when writer checks “reviewed” on save |

Validation: `utils/blogContentModel.js`  
Entity contract: `models/blogPost.js`

## Public API

`GET /api/blog/:slug` — JSON post metadata and editorial fields.  
`GET /api/blog/:slug?full=1` — includes `content` and `schema_markup`.

## Writer UI

`/blog-writer/write` and `/blog-writer/edit/:id` — “Answer & editorial metadata” section.
