'use strict';

/**
 * Checkout funnel analytics — separate from fm_order_events (pre-order drop-off tracking).
 */

const util = require('util');
const pool = require('../routes/pool');
const queryAsync = util.promisify(pool.query).bind(pool);

const CLIENT_EVENTS = new Set([
  'checkout_opened',
  'name_entered',
  'email_entered',
  'mobile_entered',
  'payment_method_selected',
  'proceed_clicked',
  'validation_failed'
]);

const SERVER_EVENTS = new Set([
  'payment_request_created',
  'ccavenue_redirect_started',
  'validation_failed'
]);

let ensurePromise = null;

async function ensureTables() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await queryAsync(`
      CREATE TABLE IF NOT EXISTS checkout_funnel_events (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        event_name VARCHAR(64) NOT NULL,
        funnel_id VARCHAR(64) NOT NULL,
        session_id VARCHAR(128) NULL,
        product_type VARCHAR(16) NULL,
        plan VARCHAR(32) NULL,
        seo_name VARCHAR(255) NULL,
        source_code_id INT NULL,
        billing_name VARCHAR(255) NULL,
        billing_email VARCHAR(255) NULL,
        billing_tel VARCHAR(32) NULL,
        payment_pref VARCHAR(32) NULL,
        payment_app VARCHAR(32) NULL,
        final_amount DECIMAL(10,2) NULL,
        order_id VARCHAR(64) NULL,
        validation_errors TEXT NULL,
        meta_json MEDIUMTEXT NULL,
        page_url VARCHAR(512) NULL,
        referrer VARCHAR(512) NULL,
        ip_address VARCHAR(64) NULL,
        user_agent VARCHAR(512) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_cfe_funnel (funnel_id),
        KEY idx_cfe_event_created (event_name, created_at),
        KEY idx_cfe_session (session_id),
        KEY idx_cfe_email (billing_email),
        KEY idx_cfe_order (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}

function reqMeta(req) {
  const xff = req.headers['x-forwarded-for'];
  const ip = req.ip || (Array.isArray(xff) ? xff[0] : String(xff || '').split(',')[0].trim()) || null;
  return {
    ip_address: ip ? String(ip).slice(0, 64) : null,
    user_agent: (req.headers['user-agent'] || '').slice(0, 512) || null,
    session_id: req.sessionID || null
  };
}

function pickStr(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function pickAmount(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

async function trackEvent(input) {
  const eventName = pickStr(input.event_name, 64);
  if (!eventName) return null;
  if (!CLIENT_EVENTS.has(eventName) && !SERVER_EVENTS.has(eventName)) {
    return null;
  }

  const funnelId = pickStr(input.funnel_id, 64);
  if (!funnelId) return null;

  await ensureTables();

  const row = {
    event_name: eventName,
    funnel_id: funnelId,
    session_id: pickStr(input.session_id, 128),
    product_type: pickStr(input.product_type, 16),
    plan: pickStr(input.plan, 32),
    seo_name: pickStr(input.seo_name, 255),
    source_code_id: input.source_code_id != null && input.source_code_id !== ''
      ? Number(input.source_code_id) || null
      : null,
    billing_name: pickStr(input.billing_name, 255),
    billing_email: pickStr(input.billing_email, 255),
    billing_tel: pickStr(input.billing_tel, 32),
    payment_pref: pickStr(input.payment_pref, 32),
    payment_app: pickStr(input.payment_app, 32),
    final_amount: pickAmount(input.final_amount),
    order_id: pickStr(input.order_id, 64),
    validation_errors: input.validation_errors
      ? JSON.stringify(input.validation_errors).slice(0, 2000)
      : null,
    meta_json: input.meta ? JSON.stringify(input.meta).slice(0, 8000) : null,
    page_url: pickStr(input.page_url, 512),
    referrer: pickStr(input.referrer, 512),
    ip_address: pickStr(input.ip_address, 64),
    user_agent: pickStr(input.user_agent, 512)
  };

  await queryAsync('INSERT INTO checkout_funnel_events SET ?', [row]);
  return row;
}

async function trackFromRequest(req, eventName, fields) {
  const meta = reqMeta(req);
  return trackEvent({
    event_name: eventName,
    funnel_id: fields.funnel_id,
    session_id: meta.session_id,
    product_type: fields.product_type,
    plan: fields.plan,
    seo_name: fields.seo_name,
    source_code_id: fields.source_code_id,
    billing_name: fields.billing_name,
    billing_email: fields.billing_email,
    billing_tel: fields.billing_tel,
    payment_pref: fields.payment_pref,
    payment_app: fields.payment_app,
    final_amount: fields.final_amount,
    order_id: fields.order_id,
    validation_errors: fields.validation_errors,
    meta: fields.meta,
    page_url: fields.page_url || req.originalUrl,
    referrer: fields.referrer || req.get('referer'),
    ip_address: meta.ip_address,
    user_agent: meta.user_agent
  });
}

module.exports = {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  ensureTables,
  trackEvent,
  trackFromRequest,
  reqMeta
};
