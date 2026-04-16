-- Optional attachment filenames for source_code (stored under public/images/ like source_code zip)
-- Run: mysql -u user -p fileachiever < migrations/source_code_attachment_files.sql
-- Ignore "Duplicate column" errors if columns already exist.

ALTER TABLE source_code ADD COLUMN readme_file VARCHAR(500) NULL DEFAULT NULL COMMENT 'README upload filename';
ALTER TABLE source_code ADD COLUMN schema_file VARCHAR(500) NULL DEFAULT NULL COMMENT 'Schema file (e.g. JSON-LD) filename';
ALTER TABLE source_code ADD COLUMN sql_file VARCHAR(500) NULL DEFAULT NULL COMMENT 'SQL dump filename';
