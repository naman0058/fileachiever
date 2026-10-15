-- Phase 6: client dependency lifecycle + follow-up history
-- Run after freelancing_ops_workflow.sql
-- Skip statements that fail with duplicate column/table.

-- Expand categories (maps legacy waiting_info → waiting_project_requirements)
ALTER TABLE leads MODIFY COLUMN client_dependency ENUM(
  'none',
  'waiting_files',
  'waiting_project_requirements',
  'waiting_info',
  'waiting_clarification',
  'waiting_feedback',
  'waiting_approval',
  'revision_clarification',
  'other'
) NOT NULL DEFAULT 'none';

UPDATE leads SET client_dependency = 'waiting_project_requirements' WHERE client_dependency = 'waiting_info';

ALTER TABLE leads ADD COLUMN client_dependency_status ENUM(
  'open','follow_up_scheduled','awaiting_response','resolved'
) NULL DEFAULT NULL;

ALTER TABLE leads ADD COLUMN client_dependency_opened_at DATETIME NULL;
ALTER TABLE leads ADD COLUMN client_dependency_resolved_at DATETIME NULL;
ALTER TABLE leads ADD COLUMN follow_up_owner VARCHAR(128) NULL;

CREATE TABLE IF NOT EXISTS lead_follow_up_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  dependency_type VARCHAR(64) NULL,
  dependency_status VARCHAR(32) NULL,
  follow_up_owner VARCHAR(128) NULL,
  next_follow_up DATE NULL,
  outcome VARCHAR(500) NULL,
  internal_note TEXT NULL,
  channel VARCHAR(32) NOT NULL DEFAULT 'internal_note',
  recorded_by VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lful_lead (lead_id),
  INDEX idx_lful_created (created_at),
  INDEX idx_lful_next (next_follow_up)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_leads_client_dep_status ON leads (client_dependency, client_dependency_status, follow_up_due);
