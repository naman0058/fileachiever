-- Fix: Allow 'setup_support' role in crm_users
-- The role column is likely ENUM('admin','agent') - change to VARCHAR to support setup_support

ALTER TABLE crm_users MODIFY COLUMN role VARCHAR(50) NOT NULL DEFAULT 'agent';
