-- Ensure at least one admin user exists in crm_users for Sales Admin access
-- Run: mysql -u user -p fileachiever < migrations/sales_admin_user.sql
-- Edit email/password below before running, or run the UPDATE after to set your credentials.

-- Option 1: Update first existing user to admin (if crm_users has rows)
UPDATE crm_users SET role = 'admin' WHERE id = (SELECT * FROM (SELECT MIN(id) FROM crm_users) x);

-- Option 2: If no users exist, insert one (uncomment and set your email/password)
-- INSERT INTO crm_users (name, email, password, role, is_active, created_at)
-- VALUES ('Admin', 'admin@example.com', 'your_password', 'admin', 1, NOW())
-- ON DUPLICATE KEY UPDATE role = 'admin';
