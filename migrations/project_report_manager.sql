-- Project Report Manager: headings/subheadings/body per source code
-- Minimum 10 headings required per source code
-- Run: mysql -u user -p fileachiever < migrations/project_report_manager.sql

-- 1. Report sections: heading, subheading, body per source code
CREATE TABLE IF NOT EXISTS source_code_report_sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_code_id BIGINT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  heading VARCHAR(500) NOT NULL DEFAULT '',
  subheading VARCHAR(500) NULL DEFAULT NULL,
  body LONGTEXT NULL DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_source_code (source_code_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Admin verification columns on source_code
ALTER TABLE source_code ADD COLUMN prm_report_verified TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE source_code ADD COLUMN prm_verified_by INT NULL;
ALTER TABLE source_code ADD COLUMN prm_verified_at DATETIME NULL;
