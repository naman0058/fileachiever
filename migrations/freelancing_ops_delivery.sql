-- Phase 5: delivery pipeline events, revisions, quality metadata
-- Run after freelancing_ops_workflow.sql and freelancing_ops_lifecycle.sql
-- Skip statements that fail with duplicate column/table.

ALTER TABLE leads ADD COLUMN stage_entered_at DATETIME NULL;

-- Backfill time-in-stage baseline (does not fabricate delivery events)
UPDATE leads SET stage_entered_at = COALESCE(internal_completed_at, created_at) WHERE stage_entered_at IS NULL;

CREATE TABLE IF NOT EXISTS lead_delivery_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor VARCHAR(128) NULL,
  metadata JSON NULL,
  INDEX idx_lde_lead (lead_id),
  INDEX idx_lde_lead_type (lead_id, event_type),
  INDEX idx_lde_occurred (occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lead_revisions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  revision_number INT UNSIGNED NOT NULL,
  reason VARCHAR(500) NULL,
  notes TEXT NULL,
  responsible_agent VARCHAR(128) NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  state ENUM('requested','in_progress','completed','cancelled') NOT NULL DEFAULT 'requested',
  created_by VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_lead_revision (lead_id, revision_number),
  INDEX idx_lr_lead_state (lead_id, state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lead_delivery_quality (
  lead_id INT PRIMARY KEY,
  internal_review_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  internal_review_at DATETIME NULL,
  deliverables_checklist JSON NULL,
  delivery_ready_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  delivery_ready_at DATETIME NULL,
  delivery_method VARCHAR(128) NULL,
  delivery_reference VARCHAR(255) NULL,
  client_acceptance_notes TEXT NULL,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
