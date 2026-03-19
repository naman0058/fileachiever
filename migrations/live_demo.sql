-- Live Demo table for Sales Admin
-- Run: mysql -u user -p fileachiever < migrations/live_demo.sql
-- (Replace 'fileachiever' with your database name if different)

CREATE TABLE IF NOT EXISTS live_demo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  tech_stack TEXT COMMENT 'Comma-separated or JSON array of technologies',
  demo_link VARCHAR(500) NOT NULL,
  project_details TEXT,
  admin_features TEXT,
  user_features TEXT,

  -- SEO-friendly URL slug (unique, used in /demo/slug)
  seo_slug VARCHAR(255) NOT NULL UNIQUE,

  -- On-page SEO fields
  meta_title VARCHAR(255),
  meta_description TEXT,
  meta_keywords VARCHAR(500),
  meta_tags TEXT COMMENT 'Optional JSON for custom og: tags',
  meta_robots VARCHAR(100) DEFAULT 'index, follow',
  og_title VARCHAR(255),
  og_description TEXT,
  og_image VARCHAR(500),
  canonical_url VARCHAR(500),

  -- JSON-LD schema (SoftwareApplication, WebApplication, etc.)
  schema_json TEXT,

  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_slug (seo_slug),
  INDEX idx_active (is_active),
  INDEX idx_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
