-- Freelancing ops workflow fields (backward-compatible)
-- Run: mysql -u user -p your_db < migrations/freelancing_ops_workflow.sql
-- Skip any line that fails with "Duplicate column name".

ALTER TABLE leads ADD COLUMN priority ENUM('critical','high','medium','low') NOT NULL DEFAULT 'medium';
ALTER TABLE leads ADD COLUMN delivery_stage ENUM(
  'unassigned','assigned','in_progress','internal_review','client_review',
  'revision_required','ready_for_delivery','delivered','closed'
) NULL DEFAULT NULL;
ALTER TABLE leads ADD COLUMN client_dependency ENUM(
  'none','waiting_files','waiting_info','waiting_approval','waiting_feedback','revision_clarification','other'
) NOT NULL DEFAULT 'none';
ALTER TABLE leads ADD COLUMN client_dependency_note TEXT NULL;
ALTER TABLE leads ADD COLUMN blocker_reason VARCHAR(500) NULL;
ALTER TABLE leads ADD COLUMN blocker_resolved_at DATETIME NULL;
ALTER TABLE leads ADD COLUMN next_action_date DATE NULL;
ALTER TABLE leads ADD COLUMN follow_up_due DATE NULL;
ALTER TABLE leads ADD COLUMN internal_completed_at DATETIME NULL;
ALTER TABLE leads ADD COLUMN client_submitted_at DATETIME NULL;
ALTER TABLE leads ADD COLUMN delivered_at DATETIME NULL;
ALTER TABLE leads ADD COLUMN client_accepted_at DATETIME NULL;

CREATE TABLE IF NOT EXISTS lead_activity_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  event_type VARCHAR(64) NOT NULL DEFAULT 'field_change',
  field_name VARCHAR(64) NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  actor VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lead_activity_lead (lead_id),
  INDEX idx_lead_activity_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_leads_ops_stage ON leads (delivery_stage, is_project_done);
CREATE INDEX idx_leads_ops_priority_deadline ON leads (priority, deadline);
CREATE INDEX idx_leads_ops_client_dep ON leads (client_dependency, follow_up_due);
CREATE INDEX idx_leads_ops_assign_active ON leads (assign(64), is_project_done);
