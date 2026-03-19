-- Add data_table column to source_code_database_screenshots
-- Run: mysql -u user -p fileachiever < migrations/add_data_table_to_db_screenshots.sql
-- Stores HTML/rich text for tabular data (created via editor)

ALTER TABLE source_code_database_screenshots
  ADD COLUMN data_table LONGTEXT NULL DEFAULT NULL COMMENT 'HTML/rich text table content';
