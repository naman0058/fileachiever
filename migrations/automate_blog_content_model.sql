-- =============================================================================
-- automate_blog.blogs — editorial / AEO content fields (backwards-compatible)
-- Preferred: node scripts/run-automate-blog-content-model.js
-- =============================================================================

USE automate_blog;

-- Skip any statement that errors with "Duplicate column name"
ALTER TABLE `blogs` ADD COLUMN `language_code` VARCHAR(10) NOT NULL DEFAULT 'en-US';
ALTER TABLE `blogs` ADD COLUMN `target_country` CHAR(2) NOT NULL DEFAULT 'US';
ALTER TABLE `blogs` ADD COLUMN `answer_summary` TEXT NULL;
ALTER TABLE `blogs` ADD COLUMN `key_takeaways` JSON NULL;
ALTER TABLE `blogs` ADD COLUMN `entities_json` JSON NULL;
ALTER TABLE `blogs` ADD COLUMN `sources_json` JSON NULL;
ALTER TABLE `blogs` ADD COLUMN `reviewed_at` DATETIME NULL;

-- MySQL < 5.7.8: use LONGTEXT instead of JSON (runner handles automatically):
-- ALTER TABLE `blogs` ADD COLUMN `key_takeaways` LONGTEXT NULL;
-- ALTER TABLE `blogs` ADD COLUMN `entities_json` LONGTEXT NULL;
-- ALTER TABLE `blogs` ADD COLUMN `sources_json` LONGTEXT NULL;
