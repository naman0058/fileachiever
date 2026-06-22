-- Session invalidation for crm_users (auto-logout when access is revoked)
-- Run: mysql -u user -p fileachiever < migrations/crm_users_session_token.sql

ALTER TABLE crm_users
  ADD COLUMN session_token INT UNSIGNED NOT NULL DEFAULT 1 AFTER is_active;
