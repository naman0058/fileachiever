# Blog Master Admin & Content Writer System

## Overview

- **Master Admin** (`/blog-admin`): Add and manage blog content writers. Requires admin login at `/admin` first. Uses its own layout (separate from Shopkeeper).
- **Content Writers** (`/blog-writer`): Login, write SEO-friendly blogs with internal linking.

## Structure

```
routes/blog/
  admin.js   - Master admin (add writers)
  writer.js  - Content writer (login, dashboard, write)

views/blog/
  admin/
    layout/header.ejs, layout/footer.ejs  - Blog admin layout (no Shopkeeper)
    dashboard.ejs, addWriter.ejs
  writer/
    login.ejs, dashboard.ejs, write.ejs   - Standalone pages
```

## Setup

### 1. Run Database Migration

```bash
mysql -u your_user -p automate_blog < automate_blog_migration.sql
```

Or run the SQL manually in your MySQL client against the `automate_blog` database.

### 2. Optional: Add BLOG_WRITER_SALT to .env

For stronger password hashing, set a unique salt in `.env`:

```
BLOG_WRITER_SALT=your-random-secret-salt
```

## Flow

1. **Admin** logs in at `/admin` (API key + username + password).
2. **Admin** goes to `/blog-admin` to add content writers (name, email, password).
3. **Writers** login at `/blog-writer/login` with their email and password.
4. **Writers** write blogs at `/blog-writer/write` with:
   - SEO fields: meta title, meta description, focus keyword, canonical URL
   - Internal linking: fetch all blog links, click to insert at cursor
   - Status: Draft, Pending Review, or Published

## Routes

| Path | Description |
|------|-------------|
| `/blog-admin` | Master admin dashboard (list writers) |
| `/blog-admin/add-writer` | Add new content writer |
| `/blog-writer/login` | Writer login |
| `/blog-writer/dashboard` | Writer's blog list |
| `/blog-writer/write` | Write new blog |
| `/blog-writer/edit/:id` | Edit existing blog |
| `/blog-writer/api/internal-links` | API: all blog links for internal linking |

## New Database Columns (blogs table)

- `author_id` – Links to blog_writers
- `focus_keyword` – Primary SEO keyword
- `canonical_url` – Canonical URL
- `status` – draft | pending_review | published
- `reading_time_minutes` – Auto-calculated
- `updated_at` – Last updated timestamp
- `internal_links_count` – Count of internal links in content
