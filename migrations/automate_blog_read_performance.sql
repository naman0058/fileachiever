-- =============================================================================
-- automate_blog.blogs — read performance indexes (non-destructive)
-- Preferred: node scripts/run-automate-blog-read-performance.js
-- Manual: mysql -u USER -p automate_blog < migrations/automate_blog_read_performance.sql
-- Requires MySQL 5.7+ / 8.x (InnoDB FULLTEXT)
-- =============================================================================

USE automate_blog;

-- -----------------------------------------------------------------------------
-- 0) Duplicate slug report (DO NOT DELETE ROWS)
-- If any rows returned, resolve manually before adding UNIQUE(slug).
-- -----------------------------------------------------------------------------
-- SELECT slug, COUNT(*) AS cnt, GROUP_CONCAT(id ORDER BY id) AS blog_ids
-- FROM blogs
-- WHERE slug IS NOT NULL AND TRIM(slug) <> ''
-- GROUP BY slug
-- HAVING cnt > 1
-- ORDER BY cnt DESC;

-- Non-unique slug lookup index (safe even when duplicates exist)
-- Skip if already present: ER_DUP_KEYNAME
ALTER TABLE `blogs` ADD INDEX `idx_blogs_slug` (`slug`);

-- Composite indexes for listing / sidebar / related (skip if duplicate name)
ALTER TABLE `blogs` ADD INDEX `idx_blogs_status_created_id` (`status`, `created_at`, `id`);
ALTER TABLE `blogs` ADD INDEX `idx_blogs_cat_status_created` (`category`, `status`, `created_at`, `id`);
ALTER TABLE `blogs` ADD INDEX `idx_blogs_author_status_created` (`author_id`, `status`, `created_at`, `id`);
ALTER TABLE `blogs` ADD INDEX `idx_blogs_status_updated` (`status`, `updated_at`);

-- FULLTEXT for public search (title, meta_abstract, tags, meta_keywords — not content)
ALTER TABLE `blogs` ADD FULLTEXT INDEX `ft_blog_search` (`title`, `meta_abstract`, `tags`, `meta_keywords`);

-- -----------------------------------------------------------------------------
-- UNIQUE(slug) — ONLY after duplicate slug report returns zero rows:
-- ALTER TABLE `blogs` ADD UNIQUE INDEX `uq_blogs_slug` (`slug`);
-- If duplicates exist, use scripts/blog-remediate-duplicate-slugs.js (renames slugs).
-- -----------------------------------------------------------------------------

-- Existing from automate_blog_migration.sql (do not re-add):
--   KEY idx_status (status)
--   KEY idx_author (author_id)
