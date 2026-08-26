-- Enterprise Setup Support: link checkout (fm_orders) + richer ticket fields
-- Safe to re-run: duplicate column / index errors can be ignored.

-- Allow tickets without a CRM lead (checkout-originated)
ALTER TABLE setup_support MODIFY COLUMN lead_id INT NULL;

ALTER TABLE setup_support
  ADD COLUMN fm_order_pk BIGINT UNSIGNED NULL AFTER lead_id,
  ADD COLUMN fm_order_id VARCHAR(64) NULL AFTER fm_order_pk,
  ADD COLUMN customer_email VARCHAR(255) NULL AFTER customer_number,
  ADD COLUMN source_code_id INT NULL AFTER customer_email,
  ADD COLUMN product_name VARCHAR(512) NULL AFTER source_code_id,
  ADD COLUMN seo_name VARCHAR(255) NULL AFTER product_name,
  ADD COLUMN plan_label VARCHAR(255) NULL AFTER seo_name,
  ADD COLUMN order_amount DECIMAL(10,2) NULL AFTER plan_label,
  ADD COLUMN origin ENUM('manual_lead','checkout') NOT NULL DEFAULT 'manual_lead' AFTER order_amount;

ALTER TABLE setup_support
  ADD UNIQUE KEY uq_setup_support_fm_order_id (fm_order_id);

ALTER TABLE setup_support
  ADD KEY idx_setup_support_fm_order_pk (fm_order_pk),
  ADD KEY idx_setup_support_origin (origin),
  ADD KEY idx_setup_support_completed (completed_at);

-- Persist addon plan on checkout orders for reliable detection
ALTER TABLE fm_orders
  ADD COLUMN addon_plan VARCHAR(32) NULL AFTER plan;
