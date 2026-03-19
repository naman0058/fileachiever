-- Fallback: Create source_code_diagrams WITHOUT foreign key
-- Use this if source_code_diagrams.sql fails with "incompatible" FK error
-- Run: mysql -u user -p fileachiever < migrations/source_code_diagrams_no_fk.sql

CREATE TABLE IF NOT EXISTS source_code_diagrams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_code_id INT NOT NULL,
  diagram_type VARCHAR(50) NOT NULL,
  url VARCHAR(1024) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_source_diagram (source_code_id, diagram_type),
  KEY idx_source_code (source_code_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
