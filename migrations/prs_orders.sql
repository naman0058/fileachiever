-- Project Report Sales (prs_orders)
-- Separate from Freelancing Sales CRM and from project_report_manager / creator.

CREATE TABLE IF NOT EXISTS prs_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NULL,
  fm_order_pk BIGINT UNSIGNED NULL,
  fm_order_id VARCHAR(64) NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_number VARCHAR(50) NOT NULL,
  customer_email VARCHAR(255) NULL,
  source_code_id INT NULL,
  product_name VARCHAR(512) NULL,
  seo_name VARCHAR(255) NULL,
  plan ENUM('synopsis','report','customized','originality') NOT NULL,
  plan_label VARCHAR(255) NULL,
  origin ENUM('checkout','manual') NOT NULL DEFAULT 'checkout',
  enquiry TEXT NULL,
  assigned_to INT NULL,
  status ENUM(
    'pending',
    'claimed',
    'in_progress',
    'waiting_customer',
    'ready_to_deliver',
    'delivered',
    'cancelled'
  ) NOT NULL DEFAULT 'pending',
  priority TINYINT NOT NULL DEFAULT 0,
  sla_due_at DATETIME NULL,
  claimed_at DATETIME NULL,
  delivered_at DATETIME NULL,
  notes TEXT NULL,
  delivery_note TEXT NULL,
  delivery_link VARCHAR(1024) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_prs_orders_fm_order_id (fm_order_id),
  KEY idx_prs_plan_status (plan, status),
  KEY idx_prs_assigned (assigned_to),
  KEY idx_prs_sla (sla_due_at),
  KEY idx_prs_created (created_at),
  KEY idx_prs_fm_order_pk (fm_order_pk)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bootstrap first admin (run once; change email/password):
-- INSERT INTO crm_users (name, email, password, role, is_active, created_at)
-- VALUES ('Report Sales Admin', 'reportsales-admin@filemakr.com', 'ChangeMe123!', 'report_sales_admin', 1, NOW());
