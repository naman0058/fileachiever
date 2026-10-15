-- Phase 7: workload capacity + task effort estimates
-- Run after freelancing_ops_workflow.sql

ALTER TABLE leads ADD COLUMN estimated_effort_points DECIMAL(6,2) NULL;

CREATE TABLE IF NOT EXISTS freelancing_agent_capacity (
  agent_name VARCHAR(128) NOT NULL PRIMARY KEY,
  team_name VARCHAR(128) NULL,
  capacity_points DECIMAL(8,2) NOT NULL DEFAULT 40,
  capacity_hours DECIMAL(8,2) NULL,
  skills JSON NULL,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_agent_capacity_team ON freelancing_agent_capacity (team_name);
