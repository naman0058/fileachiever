-- FileMakr shared checkout (source code + project report) — enterprise order/payment schema
-- Fresh tables for the new checkout flow (no roll_number / customization).
-- Do NOT use legacy payment_request for this flow.
--
-- Example:
--   mysql -u user -p fileachiever < migrations/fm_checkout_orders.sql

CREATE TABLE IF NOT EXISTS fm_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id VARCHAR(64) NOT NULL COMMENT 'Public order id e.g. FMK-20260817-A1B2C3',

  -- Unified product line (source OR report in same table)
  product_type ENUM('source','report') NOT NULL,
  plan VARCHAR(32) NOT NULL COMMENT 'basic|support|synopsis|report',
  plan_label VARCHAR(128) NOT NULL,
  payment_type VARCHAR(32) NOT NULL COMMENT 'source_code|synopsis|project_report',
  source_code_id INT NOT NULL,
  product_name VARCHAR(512) NOT NULL,
  seo_name VARCHAR(255) NOT NULL,

  -- Customer / billing
  billing_name VARCHAR(255) NOT NULL,
  billing_email VARCHAR(255) NOT NULL,
  billing_tel VARCHAR(32) NOT NULL,

  -- Pricing snapshot at initiate
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  list_amount DECIMAL(10,2) NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  coupon_code VARCHAR(64) NULL,
  final_amount DECIMAL(10,2) NOT NULL,

  -- Lifecycle
  order_status ENUM(
    'initiated',
    'payment_pending',
    'paid',
    'failed',
    'cancelled',
    'refunded'
  ) NOT NULL DEFAULT 'initiated',
  fulfillment_status ENUM(
    'pending',
    'ready',
    'delivered',
    'failed'
  ) NOT NULL DEFAULT 'pending',

  payment_pref VARCHAR(32) NULL COMMENT 'upi|card|netbanking|wallet preference at checkout',
  referral_code VARCHAR(64) NULL,
  merchant_id VARCHAR(32) NULL,
  is_test TINYINT(1) NOT NULL DEFAULT 0,

  -- Request context
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  session_id VARCHAR(128) NULL,

  paid_at DATETIME NULL,
  delivered_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_fm_orders_order_id (order_id),
  KEY idx_fm_orders_email (billing_email),
  KEY idx_fm_orders_tel (billing_tel),
  KEY idx_fm_orders_source (source_code_id),
  KEY idx_fm_orders_status (order_status),
  KEY idx_fm_orders_fulfill (fulfillment_status),
  KEY idx_fm_orders_product (product_type, plan),
  KEY idx_fm_orders_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fm_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_pk BIGINT UNSIGNED NOT NULL,
  order_id VARCHAR(64) NOT NULL,

  attempt_no INT NOT NULL DEFAULT 1,
  gateway VARCHAR(32) NOT NULL DEFAULT 'ccavenue',
  payment_status ENUM(
    'initiated',
    'pending',
    'success',
    'failure',
    'aborted',
    'unknown'
  ) NOT NULL DEFAULT 'initiated',

  amount DECIMAL(10,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',

  tracking_id VARCHAR(128) NULL,
  bank_ref_no VARCHAR(128) NULL,
  payment_mode VARCHAR(64) NULL,
  card_name VARCHAR(128) NULL,
  status_code VARCHAR(64) NULL,
  status_message VARCHAR(512) NULL,
  failure_message TEXT NULL,
  gateway_order_status VARCHAR(64) NULL,
  trans_date VARCHAR(64) NULL,

  billing_name VARCHAR(255) NULL,
  billing_email VARCHAR(255) NULL,
  billing_tel VARCHAR(32) NULL,
  billing_address VARCHAR(512) NULL,
  billing_city VARCHAR(128) NULL,
  billing_state VARCHAR(128) NULL,
  billing_zip VARCHAR(32) NULL,

  raw_response MEDIUMTEXT NULL COMMENT 'Full gateway callback JSON',

  initiated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_fm_payments_order_pk (order_pk),
  KEY idx_fm_payments_order_id (order_id),
  KEY idx_fm_payments_tracking (tracking_id),
  KEY idx_fm_payments_status (payment_status),
  CONSTRAINT fk_fm_payments_order
    FOREIGN KEY (order_pk) REFERENCES fm_orders (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fm_order_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_pk BIGINT UNSIGNED NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL COMMENT 'order_created|payment_initiated|payment_success|...',
  event_message VARCHAR(512) NULL,
  meta_json MEDIUMTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_fm_events_order_pk (order_pk),
  KEY idx_fm_events_order_id (order_id),
  KEY idx_fm_events_type (event_type),
  KEY idx_fm_events_created (created_at),
  CONSTRAINT fk_fm_events_order
    FOREIGN KEY (order_pk) REFERENCES fm_orders (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
