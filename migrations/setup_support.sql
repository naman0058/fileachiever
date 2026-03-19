-- Setup Support module: table + leads flags
-- Run this against your main DB (fileachiever) before using the Setup Support feature.
-- Example: mysql -u user -p fileachiever < migrations/setup_support.sql
--
-- If ALTER fails with "Duplicate column name", that column already exists - skip that line.

-- 0. Add 'setup_support' to crm_users.role ENUM (if it's an ENUM)
ALTER TABLE crm_users MODIFY COLUMN role VARCHAR(50) NOT NULL DEFAULT 'agent';

-- 1. Add optional flags to leads (for Setup Support, Project Report, PPT)
ALTER TABLE leads ADD COLUMN need_setup_support TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN need_project_report TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN need_ppt TINYINT(1) NOT NULL DEFAULT 0;

-- 2. Setup support requests table (one row per sale that needs setup support)
CREATE TABLE IF NOT EXISTS setup_support (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_number VARCHAR(50) NOT NULL,
  enquiry TEXT,
  assigned_to INT NULL,
  status ENUM('pending','in_progress','done','cancelled') NOT NULL DEFAULT 'pending',
  notes TEXT NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_assigned (assigned_to),
  INDEX idx_lead (lead_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
