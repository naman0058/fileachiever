-- Multiple subheadings per section (each with own body)
-- Run: mysql -u user -p fileachiever < migrations/project_report_subheadings.sql

CREATE TABLE IF NOT EXISTS source_code_report_subheadings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  section_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  subheading VARCHAR(500) NOT NULL DEFAULT '',
  body LONGTEXT NULL DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_section (section_id),
  CONSTRAINT fk_prm_subheading_section FOREIGN KEY (section_id) REFERENCES source_code_report_sections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
