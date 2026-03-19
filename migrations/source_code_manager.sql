-- Source Code Manager module
-- Run: mysql -u user -p fileachiever < migrations/source_code_manager.sql
-- crm_users.role is VARCHAR(50) - source_code_manager is valid

-- Add admin verification columns to source_code (ignore "Duplicate column" if already applied)
ALTER TABLE source_code ADD COLUMN scm_screenshot_verified TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE source_code ADD COLUMN scm_demo_verified TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE source_code ADD COLUMN scm_verified_by INT NULL;
ALTER TABLE source_code ADD COLUMN scm_verified_at DATETIME NULL;
