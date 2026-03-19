-- Add admin_features, user_features, functionality to source_code
-- So source_code_manager and admin can see project context when managing datatables/screenshots
-- Run: mysql -u user -p fileachiever < migrations/source_code_details_columns.sql

ALTER TABLE source_code ADD COLUMN admin_features TEXT NULL DEFAULT NULL COMMENT 'Admin panel features (one per line)';
ALTER TABLE source_code ADD COLUMN user_features TEXT NULL DEFAULT NULL COMMENT 'User-facing features (one per line)';
ALTER TABLE source_code ADD COLUMN functionality TEXT NULL DEFAULT NULL COMMENT 'Project functionality description';
