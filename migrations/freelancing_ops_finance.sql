-- Phase 8: client/agent payment ledger (partial payments, audit trail)
-- Does NOT remove or rewrite leads.lead_price, advance_amount, or legacy flags.

CREATE TABLE IF NOT EXISTS lead_client_payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  payment_date DATE NOT NULL,
  reference VARCHAR(255) NULL,
  note TEXT NULL,
  idempotency_key VARCHAR(64) NULL,
  recorded_by VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_lcp_idempotency (idempotency_key),
  INDEX idx_lcp_lead (lead_id),
  INDEX idx_lcp_date (payment_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lead_agent_payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  agent_name VARCHAR(128) NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  payment_date DATE NOT NULL,
  reference VARCHAR(255) NULL,
  note TEXT NULL,
  idempotency_key VARCHAR(64) NULL,
  recorded_by VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_lap_idempotency (idempotency_key),
  INDEX idx_lap_lead (lead_id),
  INDEX idx_lap_date (payment_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
