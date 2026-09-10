'use strict';

/**
 * Checkout funnel analytics — separate from fm_order_events (pre-order drop-off tracking).
 */

const util = require('util');
const pool = require('../routes/pool');
const { resolveBotInfo } = require('../utils/botDetection');
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

/** Dedupe + circuit breaker — burst = suppress tracking, NOT unlimited bypass. */
const recentFunnelEvents = new Map();
const funnelBurstWindows = new Map();
const suppressedFunnels = new Map();
const DEDUPE_MS = 3000;
const BURST_WINDOW_MS = 10_000;
const BURST_EVENT_THRESHOLD = 8;
const BURST_FUNNEL_THRESHOLD = 25;
const SUPPRESS_MS = 60_000;
const FUNNEL_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const MAX_FUNNELS_PER_SESSION = 8;

function pruneSessionFunnels(session) {
  if (!session || !session.checkoutFunnels) return;
  const now = Date.now();
  for (const [id, ts] of Object.entries(session.checkoutFunnels)) {
    if (now - Number(ts) > FUNNEL_SESSION_TTL_MS) delete session.checkoutFunnels[id];
  }
  const ids = Object.keys(session.checkoutFunnels);
  if (ids.length <= MAX_FUNNELS_PER_SESSION) return;
  ids
    .sort((a, b) => Number(session.checkoutFunnels[a]) - Number(session.checkoutFunnels[b]))
    .slice(0, ids.length - MAX_FUNNELS_PER_SESSION)
    .forEach((id) => delete session.checkoutFunnels[id]);
}

function registerSessionFunnel(session, funnelId) {
  if (!session || !funnelId) return;
  if (!session.checkoutFunnels) session.checkoutFunnels = Object.create(null);
  session.checkoutFunnels[String(funnelId)] = Date.now();
  pruneSessionFunnels(session);
}

function isFunnelBoundToSession(session, funnelId) {
  const fid = String(funnelId || '').trim();
  if (!fid || !session || !session.checkoutFunnels) return false;
  const ts = session.checkoutFunnels[fid];
  if (!ts) return false;
  if (Date.now() - Number(ts) > FUNNEL_SESSION_TTL_MS) {
    delete session.checkoutFunnels[fid];
    return false;
  }
  return true;
}

function guardClientFunnelEvent(funnelId, eventName) {
  const fid = String(funnelId || '').trim();
  const ev = String(eventName || '').trim();
  if (!fid || !ev) {
    return { accept: false, duplicate: false, suppressed: true, shouldLogBurst: false };
  }

  const now = Date.now();

  let sup = suppressedFunnels.get(fid);
  if (sup && now < sup.until) {
    sup.suppressedCount += 1;
    sup.lastSeen = now;
    return {
      accept: false,
      duplicate: false,
      suppressed: true,
      shouldLogBurst: false,
      suppressed_count: 1
    };
  }
  if (sup && now >= sup.until) {
    suppressedFunnels.delete(fid);
  }

  const eventKey = `${fid}:${ev}`;
  const last = recentFunnelEvents.get(eventKey);
  if (last && now - last < DEDUPE_MS) {
    return { accept: false, duplicate: true, suppressed: false, shouldLogBurst: false };
  }

  let evBurst = funnelBurstWindows.get(eventKey);
  if (!evBurst || now - evBurst.start > BURST_WINDOW_MS) {
    evBurst = { count: 0, start: now };
  }
  evBurst.count += 1;
  funnelBurstWindows.set(eventKey, evBurst);

  const funnelKey = `f:${fid}`;
  let fnBurst = funnelBurstWindows.get(funnelKey);
  if (!fnBurst || now - fnBurst.start > BURST_WINDOW_MS) {
    fnBurst = { count: 0, start: now };
  }
  fnBurst.count += 1;
  funnelBurstWindows.set(funnelKey, fnBurst);

  const burstTriggered =
    evBurst.count > BURST_EVENT_THRESHOLD || fnBurst.count >= BURST_FUNNEL_THRESHOLD;

  if (burstTriggered) {
    suppressedFunnels.set(fid, {
      until: now + SUPPRESS_MS,
      suppressedCount: 1,
      firstSeen: now,
      lastSeen: now
    });
    return {
      accept: false,
      duplicate: false,
      suppressed: true,
      burst: true,
      shouldLogBurst: true,
      suppressed_count: 1,
      burst_count: fnBurst.count
    };
  }

  recentFunnelEvents.set(eventKey, now);
  return { accept: true, duplicate: false, suppressed: false, shouldLogBurst: false };
}

function noteBurstSuppression(req, funnelId, guard) {
  const rateLimitLog = require('./rateLimitLogService');
  const { getClientIp, getSessionKey } = require('../utils/botDetection');
  rateLimitLog.logBurstSuppression({
    funnel_id: funnelId,
    ip_address: getClientIp(req),
    session_key: getSessionKey(req),
    user_agent: req.get('user-agent'),
    reason: 'funnel_burst',
    suppressed_count: guard.suppressed_count || 1
  }).catch(() => {});
}

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
        is_bot TINYINT(1) NOT NULL DEFAULT 0,
        bot_name VARCHAR(64) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_cfe_funnel (funnel_id),
        KEY idx_cfe_event_created (event_name, created_at),
        KEY idx_cfe_session (session_id),
        KEY idx_cfe_email (billing_email),
        KEY idx_cfe_order (order_id),
        KEY idx_cfe_bot (is_bot, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    for (const ddl of [
      'ALTER TABLE checkout_funnel_events ADD COLUMN is_bot TINYINT(1) NOT NULL DEFAULT 0 AFTER user_agent',
      'ALTER TABLE checkout_funnel_events ADD COLUMN bot_name VARCHAR(64) NULL AFTER is_bot',
      'ALTER TABLE checkout_funnel_events ADD KEY idx_cfe_bot (is_bot, created_at)'
    ]) {
      try {
        await queryAsync(ddl);
      } catch (e) {
        if (!(e && (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_DUP_KEYNAME' || /Duplicate/i.test(String(e.message || ''))))) {
          throw e;
        }
      }
    }
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
    user_agent: pickStr(input.user_agent, 512),
    is_bot: input.is_bot ? 1 : 0,
    bot_name: pickStr(input.bot_name, 64)
  };

  await queryAsync('INSERT INTO checkout_funnel_events SET ?', [row]);
  return row;
}

async function trackFromRequest(req, eventName, fields) {
  const meta = reqMeta(req);
  const bot = await resolveBotInfo(req);
  req.botInfo = bot;
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
    user_agent: meta.user_agent,
    is_bot: bot.is_bot,
    bot_name: bot.bot_name
  });
}

module.exports = {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  ensureTables,
  registerSessionFunnel,
  isFunnelBoundToSession,
  guardClientFunnelEvent,
  noteBurstSuppression,
  trackEvent,
  trackFromRequest,
  reqMeta
};
