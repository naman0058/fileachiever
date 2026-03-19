-- Add email column to admin table for backoffice OTP login
-- Run against your main DB (fileachiever)
-- If column exists, skip or comment out.

ALTER TABLE admin ADD COLUMN email VARCHAR(255) NULL UNIQUE;
-- Add your admin emails: UPDATE admin SET email = 'your@email.com' WHERE id = 1;
