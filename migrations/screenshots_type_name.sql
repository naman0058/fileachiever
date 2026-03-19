-- Add type and name to screenshots table
-- Run: mysql -u user -p fileachiever < migrations/screenshots_type_name.sql
-- Type: 1 = Input Design, 2 = Output Design

ALTER TABLE screenshots ADD COLUMN type VARCHAR(50) NULL DEFAULT 'input_design';
ALTER TABLE screenshots ADD COLUMN name VARCHAR(255) NULL DEFAULT '';
