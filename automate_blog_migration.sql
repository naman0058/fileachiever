-- =============================================================================
-- Migration: Blog Master Admin + Content Writers + SEO Enhancements
-- Database: automate_blog (run against pool2)
-- =============================================================================

USE automate_blog;

-- ----------------------------------------
-- 1. Blog Writers (Content Writers)
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS `blog_writers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------
-- 2. Blog Master Admins
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS `blog_master_admins` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------
-- 3. Add SEO & Author columns to blogs
-- Run each block. If "Duplicate column" error, that column exists - skip it.
-- ----------------------------------------
ALTER TABLE `blogs` ADD COLUMN `author_id` int DEFAULT NULL;
ALTER TABLE `blogs` ADD COLUMN `focus_keyword` varchar(255) DEFAULT NULL;
ALTER TABLE `blogs` ADD COLUMN `canonical_url` varchar(500) DEFAULT NULL;
ALTER TABLE `blogs` ADD COLUMN `status` enum('draft','pending_review','published') DEFAULT 'published';
ALTER TABLE `blogs` ADD COLUMN `reading_time_minutes` int DEFAULT NULL;
ALTER TABLE `blogs` ADD COLUMN `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE `blogs` ADD COLUMN `internal_links_count` int DEFAULT 0;
ALTER TABLE `blogs` ADD COLUMN `schema_markup` LONGTEXT DEFAULT NULL COMMENT 'JSON-LD Schema Markup for SEO';
ALTER TABLE `blogs` ADD KEY `idx_author` (`author_id`);
ALTER TABLE `blogs` ADD KEY `idx_status` (`status`);
