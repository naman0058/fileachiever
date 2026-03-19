-- Database Screenshots - multiple per source code, each with name
-- Run: mysql -u user -p fileachiever < migrations/source_code_database_screenshots.sql
-- No FK: source_code.id type varies. Check with: SHOW CREATE TABLE source_code;

CREATE TABLE IF NOT EXISTS source_code_database_screenshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_code_id BIGINT UNSIGNED NOT NULL,
  url VARCHAR(1024) NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_source_code (source_code_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
