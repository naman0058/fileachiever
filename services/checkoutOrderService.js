'use strict';

/**
 * Enterprise checkout order service for shared Source Code + Project Report flow.
 * Uses fm_orders / fm_payments / fm_order_events — not legacy payment_request.
 */

const util = require('util');
const pool = require('../routes/pool');
const ccavConfig = require('../config/ccavenue');
const setupSupportService = require('./setupSupportService');
const projectReportSalesService = require('./projectReportSalesService');

const queryAsync = util.promisify(pool.query).bind(pool);

const MERCHANT_ID = ccavConfig.merchantId;
const REDIRECT_URL = ccavConfig.redirectUrl;
const CANCEL_URL = ccavConfig.cancelUrl;

let ensurePromise = null;

function generatePublicOrderId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FMK-${y}${m}${d}-${rand}`;
}

async function ensureTables() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await queryAsync(`
      CREATE TABLE IF NOT EXISTS fm_orders (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_id VARCHAR(64) NOT NULL,
        product_type ENUM('source','report') NOT NULL,
        plan VARCHAR(32) NOT NULL,
        plan_label VARCHAR(128) NOT NULL,
        payment_type VARCHAR(32) NOT NULL,
        source_code_id INT NOT NULL,
        product_name VARCHAR(512) NOT NULL,
        seo_name VARCHAR(255) NOT NULL,
        billing_name VARCHAR(255) NOT NULL,
        billing_email VARCHAR(255) NOT NULL,
        billing_tel VARCHAR(32) NOT NULL,
        currency CHAR(3) NOT NULL DEFAULT 'INR',
        list_amount DECIMAL(10,2) NOT NULL,
        discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        coupon_code VARCHAR(64) NULL,
        final_amount DECIMAL(10,2) NOT NULL,
        order_status ENUM('initiated','payment_pending','paid','failed','cancelled','refunded') NOT NULL DEFAULT 'initiated',
        fulfillment_status ENUM('pending','ready','delivered','failed') NOT NULL DEFAULT 'pending',
        payment_pref VARCHAR(32) NULL,
        referral_code VARCHAR(64) NULL,
        merchant_id VARCHAR(32) NULL,
        is_test TINYINT(1) NOT NULL DEFAULT 0,
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
        KEY idx_fm_orders_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryAsync(`
      CREATE TABLE IF NOT EXISTS fm_payments (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_pk BIGINT UNSIGNED NOT NULL,
        order_id VARCHAR(64) NOT NULL,
        attempt_no INT NOT NULL DEFAULT 1,
        gateway VARCHAR(32) NOT NULL DEFAULT 'ccavenue',
        payment_status ENUM('initiated','pending','success','failure','aborted','unknown') NOT NULL DEFAULT 'initiated',
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
        raw_response MEDIUMTEXT NULL,
        initiated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_fm_payments_order_pk (order_pk),
        KEY idx_fm_payments_order_id (order_id),
        KEY idx_fm_payments_tracking (tracking_id),
        KEY idx_fm_payments_status (payment_status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryAsync(`
      CREATE TABLE IF NOT EXISTS fm_order_events (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_pk BIGINT UNSIGNED NOT NULL,
        order_id VARCHAR(64) NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        event_message VARCHAR(512) NULL,
        meta_json MEDIUMTEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_fm_events_order_pk (order_pk),
        KEY idx_fm_events_order_id (order_id),
        KEY idx_fm_events_type (event_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryAsync(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // addon_plan for setup-support detection (safe if already present)
    try {
      await queryAsync(`ALTER TABLE fm_orders ADD COLUMN addon_plan VARCHAR(32) NULL AFTER plan`);
    } catch (e) {
      if (!(e && (e.code === 'ER_DUP_FIELDNAME' || /Duplicate column/i.test(String(e.message || ''))))) {
        throw e;
      }
    }
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}

async function addEvent(orderPk, orderId, eventType, eventMessage, meta) {
  await ensureTables();
  await queryAsync('INSERT INTO fm_order_events SET ?', {
    order_pk: orderPk,
    order_id: orderId,
    event_type: eventType,
    event_message: eventMessage || null,
    meta_json: meta ? JSON.stringify(meta) : null
  });
}

async function findByOrderId(orderId) {
  if (!orderId) return null;
  await ensureTables();
  const rows = await queryAsync('SELECT * FROM fm_orders WHERE order_id = ? LIMIT 1', [String(orderId)]);
  return rows && rows[0] ? rows[0] : null;
}

async function countPaymentAttempts(orderPk) {
  const rows = await queryAsync(
    'SELECT COUNT(*) AS c FROM fm_payments WHERE order_pk = ?',
    [orderPk]
  );
  return rows && rows[0] ? Number(rows[0].c) || 0 : 0;
}

/**
 * Create order + payment initiate row + audit events.
 * Returns { order, payment, ccavenuePayload }
 */
async function createCheckoutOrder(input) {
  await ensureTables();

  const listAmount = Number(input.listAmount);
  const finalAmount = Number(input.finalAmount);
  const discountAmount = Math.max(0, Math.round((listAmount - finalAmount) * 100) / 100);
  const amountStr = finalAmount.toFixed(2);
  const orderId = input.orderId || generatePublicOrderId();
  const isTest = input.isTest ? 1 : 0;
  const paymentPref = ccavConfig.normalizePaymentPref(input.paymentPref || input.paymentApp);

  if (!MERCHANT_ID) {
    throw new Error('CCAvenue merchant id is not configured');
  }

  const orderRow = {
    order_id: orderId,
    product_type: input.productType,
    plan: input.plan,
    plan_label: input.planLabel,
    payment_type: input.paymentType,
    source_code_id: input.sourceCodeId,
    product_name: input.productName || '',
    seo_name: input.seoName || '',
    billing_name: input.billingName,
    billing_email: input.billingEmail,
    billing_tel: input.billingTel,
    currency: 'INR',
    list_amount: listAmount.toFixed(2),
    discount_amount: discountAmount.toFixed(2),
    coupon_code: input.couponCode || null,
    final_amount: amountStr,
    order_status: isTest ? 'paid' : 'payment_pending',
    fulfillment_status: isTest ? 'ready' : 'pending',
    payment_pref: paymentPref,
    referral_code: input.referralCode || null,
    merchant_id: MERCHANT_ID,
    is_test: isTest,
    ip_address: input.ipAddress || null,
    user_agent: input.userAgent ? String(input.userAgent).slice(0, 512) : null,
    session_id: input.sessionId || null,
    paid_at: isTest ? new Date() : null,
    addon_plan: (input.addon && (input.addon.plan || input.addon.id)) || null
  };

  const insertResult = await queryAsync('INSERT INTO fm_orders SET ?', orderRow);
  const orderPk = insertResult.insertId;

  await addEvent(orderPk, orderId, 'order_created', 'Checkout order created', {
    product_type: orderRow.product_type,
    plan: orderRow.plan,
    final_amount: amountStr,
    is_test: !!isTest,
    addon: input.addon || null
  });

  const attemptNo = 1;
  const paymentRow = {
    order_pk: orderPk,
    order_id: orderId,
    attempt_no: attemptNo,
    gateway: isTest ? 'dummy' : 'ccavenue',
    payment_status: isTest ? 'success' : 'initiated',
    amount: amountStr,
    currency: 'INR',
    payment_mode: paymentPref,
    billing_name: input.billingName,
    billing_email: input.billingEmail,
    billing_tel: input.billingTel,
    completed_at: isTest ? new Date() : null,
    raw_response: isTest
      ? JSON.stringify({ mode: 'dummy', note: 'TEST payment — gateway skipped' })
      : null
  };

  const payInsert = await queryAsync('INSERT INTO fm_payments SET ?', paymentRow);

  await addEvent(
    orderPk,
    orderId,
    isTest ? 'payment_success' : 'payment_initiated',
    isTest ? 'Dummy payment marked success' : 'Payment initiated — redirecting to gateway',
    { payment_id: payInsert.insertId, gateway: paymentRow.gateway }
  );

  if (isTest) {
    await addEvent(orderPk, orderId, 'fulfillment_ready', 'Order marked ready for download', null);
  }

  let order = await findByOrderId(orderId);

  // Dummy / test paid orders: create setup-support + report-sales tickets immediately
  if (isTest && order) {
    try {
      await setupSupportService.ensureSetupSupportForPaidOrder(order);
      order = await findByOrderId(orderId);
    } catch (ssErr) {
      console.error('[setup-support] ensure after dummy order failed:', ssErr.message || ssErr);
    }
    try {
      await projectReportSalesService.ensurePrsTicketForPaidOrder(order || (await findByOrderId(orderId)));
      order = await findByOrderId(orderId);
    } catch (prsErr) {
      console.error('[report-sales] ensure after dummy order failed:', prsErr.message || prsErr);
    }
  }

  const paymentOption = ccavConfig.mapPaymentOption(input.paymentApp || paymentPref);
  const appHint = String(input.paymentApp || paymentPref || 'upi').trim().toLowerCase().slice(0, 32);

  const ccavenuePayload = {
    merchant_id: MERCHANT_ID,
    order_id: orderId,
    currency: 'INR',
    amount: amountStr,
    redirect_url: REDIRECT_URL,
    cancel_url: CANCEL_URL,
    language: 'EN',
    billing_name: input.billingName,
    billing_email: input.billingEmail,
    billing_tel: input.billingTel,
    billing_country: 'India',
    // Pre-select method on CCAvenue hosted page (UPI opens app intents on mobile)
    payment_option: paymentOption,
    merchant_param1: paymentPref,
    merchant_param2: appHint,
    merchant_param3: String(input.productType || '').slice(0, 32),
    merchant_param4: String(input.plan || '').slice(0, 32)
  };

  return {
    order,
    paymentId: payInsert.insertId,
    ccavenuePayload,
    amountStr,
    orderId,
    paymentOption,
    paymentPref
  };
}

function amountsMatch(expected, actual) {
  const a = Math.round(Number(expected) * 100);
  const b = Math.round(Number(actual) * 100);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a === b;
}

async function recordGatewayResponse(order, decrypted) {
  await ensureTables();
  const gatewayStatus = String(decrypted.order_status || '').trim();
  let paymentStatus = 'unknown';
  if (gatewayStatus === 'Success') paymentStatus = 'success';
  else if (gatewayStatus === 'Failure') paymentStatus = 'failure';
  else if (gatewayStatus === 'Aborted') paymentStatus = 'aborted';

  // Idempotency: already paid → do not re-fulfill / overwrite success
  if (String(order.order_status) === 'paid' && paymentStatus === 'success') {
    await addEvent(order.id, order.order_id, 'payment_duplicate', 'Duplicate success ignored (already paid)', {
      tracking_id: decrypted.tracking_id || null
    });
    return findByOrderId(order.order_id);
  }

  // Amount / currency integrity — never unlock downloads on mismatch
  if (paymentStatus === 'success') {
    const currencyOk = String(decrypted.currency || 'INR').toUpperCase() === 'INR';
    const amountOk = amountsMatch(order.final_amount, decrypted.amount);
    if (!currencyOk || !amountOk) {
      await addEvent(order.id, order.order_id, 'payment_amount_mismatch', 'Gateway amount/currency mismatch — treated as failure', {
        expected_amount: order.final_amount,
        gateway_amount: decrypted.amount,
        expected_currency: order.currency || 'INR',
        gateway_currency: decrypted.currency || null,
        tracking_id: decrypted.tracking_id || null
      });
      paymentStatus = 'failure';
    }
  }

  const openRows = await queryAsync(
    `SELECT id FROM fm_payments
     WHERE order_pk = ? AND payment_status IN ('initiated','pending')
     ORDER BY id DESC LIMIT 1`,
    [order.id]
  );

  const paymentFields = {
    payment_status: paymentStatus,
    amount: decrypted.amount != null ? String(decrypted.amount) : order.final_amount,
    currency: decrypted.currency || order.currency || 'INR',
    tracking_id: decrypted.tracking_id || null,
    bank_ref_no: decrypted.bank_ref_no || null,
    payment_mode: decrypted.payment_mode || null,
    card_name: decrypted.card_name || null,
    status_code: decrypted.status_code || null,
    status_message: decrypted.status_message || null,
    failure_message:
      paymentStatus === 'failure' && gatewayStatus === 'Success'
        ? 'Amount/currency mismatch vs order'
        : decrypted.failure_message || null,
    gateway_order_status: gatewayStatus || null,
    trans_date: decrypted.trans_date || null,
    billing_name: decrypted.billing_name || null,
    billing_email: decrypted.billing_email || null,
    billing_tel: decrypted.billing_tel || null,
    billing_address: decrypted.billing_address || null,
    billing_city: decrypted.billing_city || null,
    billing_state: decrypted.billing_state || null,
    billing_zip: decrypted.billing_zip || null,
    raw_response: JSON.stringify(decrypted),
    completed_at: new Date()
  };

  let paymentId;
  if (openRows && openRows[0]) {
    paymentId = openRows[0].id;
    await queryAsync('UPDATE fm_payments SET ? WHERE id = ?', [paymentFields, paymentId]);
  } else {
    const attemptNo = (await countPaymentAttempts(order.id)) + 1;
    const payInsert = await queryAsync('INSERT INTO fm_payments SET ?', {
      order_pk: order.id,
      order_id: order.order_id,
      attempt_no: attemptNo,
      gateway: 'ccavenue',
      ...paymentFields
    });
    paymentId = payInsert.insertId;
  }

  if (paymentStatus === 'success') {
    const wasUnpaid = String(order.order_status) !== 'paid';
    await queryAsync(
      `UPDATE fm_orders SET
        order_status = 'paid',
        fulfillment_status = 'ready',
        paid_at = NOW(),
        billing_name = COALESCE(?, billing_name),
        billing_email = COALESCE(?, billing_email),
        billing_tel = COALESCE(?, billing_tel)
       WHERE id = ? AND order_status <> 'paid'`,
      [
        decrypted.billing_name || null,
        decrypted.billing_email || null,
        decrypted.billing_tel || null,
        order.id
      ]
    );
    await addEvent(order.id, order.order_id, 'payment_success', 'Gateway payment success', {
      payment_id: paymentId,
      tracking_id: decrypted.tracking_id || null,
      payment_mode: decrypted.payment_mode || null,
      amount: decrypted.amount || null
    });
    await addEvent(order.id, order.order_id, 'fulfillment_ready', 'Order ready for download', null);

    // Auto-create Setup Support + Report Sales tickets (idempotent)
    if (wasUnpaid) {
      try {
        const paidOrder = await findByOrderId(order.order_id);
        await setupSupportService.ensureSetupSupportForPaidOrder(paidOrder || order);
      } catch (ssErr) {
        console.error('[setup-support] ensure after payment failed:', ssErr.message || ssErr);
      }
      try {
        const paidOrder = await findByOrderId(order.order_id);
        await projectReportSalesService.ensurePrsTicketForPaidOrder(paidOrder || order);
      } catch (prsErr) {
        console.error('[report-sales] ensure after payment failed:', prsErr.message || prsErr);
      }
    }
  } else {
    const nextStatus = paymentStatus === 'aborted' ? 'cancelled' : 'failed';
    // Do not downgrade an already-paid order
    if (String(order.order_status) !== 'paid') {
      await queryAsync(`UPDATE fm_orders SET order_status = ? WHERE id = ?`, [nextStatus, order.id]);
    }
    await addEvent(order.id, order.order_id, 'payment_' + paymentStatus, 'Gateway payment ' + gatewayStatus, {
      payment_id: paymentId,
      failure_message: paymentFields.failure_message || decrypted.failure_message || null
    });
  }

  return findByOrderId(order.order_id);
}

async function markDelivered(orderId) {
  const order = await findByOrderId(orderId);
  if (!order) return null;
  await queryAsync(
    `UPDATE fm_orders SET fulfillment_status = 'delivered', delivered_at = NOW() WHERE id = ? AND fulfillment_status <> 'delivered'`,
    [order.id]
  );
  await addEvent(order.id, order.order_id, 'fulfillment_delivered', 'Download delivered to customer', null);
  return findByOrderId(orderId);
}

function formatPaymentDate(dateLike) {
  const d = dateLike ? new Date(dateLike) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

const RATING_LABELS = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent'
};

async function findReviewByOrderId(orderId) {
  if (!orderId) return null;
  await ensureTables();
  const rows = await queryAsync(
    'SELECT * FROM fm_order_reviews WHERE order_id = ? LIMIT 1',
    [String(orderId)]
  );
  return rows && rows[0] ? rows[0] : null;
}

/**
 * Upsert order rating/review (one review per order_id).
 */
async function saveOrderReview(input) {
  await ensureTables();
  const rating = parseInt(input.rating, 10);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error('Rating must be between 1 and 5');
  }
  const orderId = String(input.orderId || '').trim();
  if (!orderId) throw new Error('Order ID is required');

  const order = await findByOrderId(orderId);
  const reviewText = String(input.reviewText || '').trim().slice(0, 1000) || null;
  const ratingLabel = RATING_LABELS[rating] || null;

  const row = {
    order_pk: order ? order.id : null,
    order_id: orderId,
    source_code_id: order ? order.source_code_id : input.sourceCodeId || null,
    product_type: order ? order.product_type : input.productType || null,
    plan: order ? order.plan : input.plan || null,
    rating,
    rating_label: ratingLabel,
    review_text: reviewText,
    billing_name: order ? order.billing_name : input.billingName || null,
    billing_email: order ? order.billing_email : input.billingEmail || null,
    billing_tel: order ? order.billing_tel : input.billingTel || null,
    ip_address: input.ipAddress || null,
    user_agent: input.userAgent ? String(input.userAgent).slice(0, 512) : null
  };

  const existing = await findReviewByOrderId(orderId);
  if (existing) {
    await queryAsync(
      `UPDATE fm_order_reviews SET
        rating = ?, rating_label = ?, review_text = ?,
        source_code_id = COALESCE(?, source_code_id),
        product_type = COALESCE(?, product_type),
        plan = COALESCE(?, plan),
        billing_name = COALESCE(?, billing_name),
        billing_email = COALESCE(?, billing_email),
        billing_tel = COALESCE(?, billing_tel),
        updated_at = NOW()
       WHERE order_id = ?`,
      [
        row.rating,
        row.rating_label,
        row.review_text,
        row.source_code_id,
        row.product_type,
        row.plan,
        row.billing_name,
        row.billing_email,
        row.billing_tel,
        orderId
      ]
    );
  } else {
    await queryAsync('INSERT INTO fm_order_reviews SET ?', row);
  }

  if (order) {
    await addEvent(order.id, orderId, 'review_submitted', 'Customer submitted rating ' + rating, {
      rating,
      rating_label: ratingLabel,
      has_review_text: !!reviewText
    });
  }

  return findReviewByOrderId(orderId);
}

module.exports = {
  MERCHANT_ID,
  REDIRECT_URL,
  CANCEL_URL,
  RATING_LABELS,
  ensureTables,
  generatePublicOrderId,
  findByOrderId,
  createCheckoutOrder,
  recordGatewayResponse,
  markDelivered,
  addEvent,
  formatPaymentDate,
  findReviewByOrderId,
  saveOrderReview
};
