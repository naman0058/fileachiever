-- Source Code Diagrams - ER, DFD, Use Case, etc.
-- Run: mysql -u user -p fileachiever < migrations/source_code_diagrams.sql
-- Each source code can have one URL per diagram type
--
-- No FK: source_code.id type varies (INT/BIGINT, signed/unsigned). Use same type
-- as source_code.id if you want FK. Check with: SHOW CREATE TABLE source_code;

CREATE TABLE IF NOT EXISTS source_code_diagrams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_code_id BIGINT UNSIGNED NOT NULL,
  diagram_type VARCHAR(50) NOT NULL,
  url VARCHAR(1024) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_source_diagram (source_code_id, diagram_type),
  KEY idx_source_code (source_code_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
