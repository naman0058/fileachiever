-- Checkout order ratings / reviews (shared source + report flow)
-- Example: mysql -u user -p fileachiever < migrations/fm_order_reviews.sql

CREATE TABLE IF NOT EXISTS fm_order_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_pk BIGINT UNSIGNED NULL,
  order_id VARCHAR(64) NOT NULL,
  source_code_id INT NULL,
  product_type VARCHAR(32) NULL,
  plan VARCHAR(32) NULL,
  rating TINYINT UNSIGNED NOT NULL,
  rating_label VARCHAR(32) NULL,
  review_text VARCHAR(1000) NULL,
  billing_name VARCHAR(255) NULL,
  billing_email VARCHAR(255) NULL,
  billing_tel VARCHAR(32) NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fm_reviews_order_id (order_id),
  KEY idx_fm_reviews_rating (rating),
  KEY idx_fm_reviews_source (source_code_id),
  KEY idx_fm_reviews_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
