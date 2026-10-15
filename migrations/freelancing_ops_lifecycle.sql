-- Phase 3: lifecycle concurrency + activity reason (backward-compatible)
-- Run after freelancing_ops_workflow.sql
-- mysql -u user -p your_db < migrations/freelancing_ops_lifecycle.sql
-- Skip statements that fail with duplicate column/index.

ALTER TABLE leads ADD COLUMN ops_version INT UNSIGNED NOT NULL DEFAULT 0;

ALTER TABLE lead_activity_log ADD COLUMN reason VARCHAR(500) NULL;

-- Sheet sync (INSERT IGNORE) never updates existing rows — ops_version, delivery_stage,
-- priority, and activity log remain authoritative from the ops UI / API after migration.
