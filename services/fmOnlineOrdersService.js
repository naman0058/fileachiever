'use strict';

/**
 * FM Online Orders — Sales Admin payment ops + sales analytics
 * Tables: fm_orders, fm_payments, fm_order_events
 */

const util = require('util');
const pool = require('../routes/pool');
const checkoutOrders = require('./checkoutOrderService');

const queryAsync = util.promisify(pool.query).bind(pool);

let ensurePromise = null;

async function tryAlter(sql) {
  try {
    await queryAsync(sql);
  } catch (e) {
    if (e && (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_DUP_KEYNAME')) return;
    const msg = String(e && e.message ? e.message : e);
    if (/Duplicate|already exists/i.test(msg)) return;
    throw e;
  }
}

async function ensureSchema() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    if (typeof checkoutOrders.ensureTables === 'function') {
      await checkoutOrders.ensureTables();
    }
    await tryAlter(`ALTER TABLE fm_orders ADD KEY idx_fm_orders_is_test (is_test)`);
    await tryAlter(`ALTER TABLE fm_orders ADD KEY idx_fm_orders_paid_at (paid_at)`);
    await tryAlter(`ALTER TABLE fm_payments ADD KEY idx_fm_payments_status (payment_status)`);
    await tryAlter(`ALTER TABLE fm_payments ADD KEY idx_fm_payments_completed (completed_at)`);
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}

function monthRange(selectedMonth) {
  // Local calendar dates only — avoid toISOString() (UTC shift breaks IST month end).
  const start = `${selectedMonth}-01`;
  const [y, m] = selectedMonth.split('-').map(Number);
  const endY = m === 12 ? y + 1 : y;
  const endM = m === 12 ? 1 : m + 1;
  const end = `${endY}-${String(endM).padStart(2, '0')}-01`;
  return { start, end };
}

/** Counts for empty-state / default filter decisions */
async function countTestVsLive() {
  await ensureSchema();
  const [row] = await queryAsync(`
    SELECT
      SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) AS test_count,
      SUM(CASE WHEN is_test = 0 OR is_test IS NULL THEN 1 ELSE 0 END) AS live_count
    FROM fm_orders
  `);
  return {
    test: n(row && row.test_count),
    live: n(row && row.live_count)
  };
}

function testClause(includeTest, alias = 'o') {
  if (includeTest) return '1=1';
  return `${alias}.is_test = 0`;
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

async function getOverviewKpis(selectedMonth, { includeTest = false } = {}) {
  await ensureSchema();
  const { start, end } = monthRange(selectedMonth);
  const t = testClause(includeTest, 'o');

  const [[paid], [gmv], [pending], [failed], [cancelled], [initiated], [delivered], [todayPaid], [todayGmv], [avgTicket]] =
    await Promise.all([
      queryAsync(
        `SELECT COUNT(*) AS c FROM fm_orders o
         WHERE ${t} AND o.order_status='paid' AND o.paid_at >= ? AND o.paid_at < ?`,
        [start, end]
      ),
      queryAsync(
        `SELECT COALESCE(SUM(o.final_amount),0) AS s FROM fm_orders o
         WHERE ${t} AND o.order_status='paid' AND o.paid_at >= ? AND o.paid_at < ?`,
        [start, end]
      ),
      queryAsync(
        `SELECT COUNT(*) AS c FROM fm_orders o
         WHERE ${t} AND o.order_status IN ('initiated','payment_pending')`
      ),
      queryAsync(
        `SELECT COUNT(*) AS c FROM fm_orders o
         WHERE ${t} AND o.order_status='failed' AND o.created_at >= ? AND o.created_at < ?`,
        [start, end]
      ),
      queryAsync(
        `SELECT COUNT(*) AS c FROM fm_orders o
         WHERE ${t} AND o.order_status='cancelled' AND o.created_at >= ? AND o.created_at < ?`,
        [start, end]
      ),
      queryAsync(
        `SELECT COUNT(*) AS c FROM fm_orders o
         WHERE ${t} AND o.created_at >= ? AND o.created_at < ?`,
        [start, end]
      ),
      queryAsync(
        `SELECT COUNT(*) AS c FROM fm_orders o
         WHERE ${t} AND o.fulfillment_status='delivered'
           AND o.delivered_at >= ? AND o.delivered_at < ?`,
        [start, end]
      ),
      queryAsync(
        `SELECT COUNT(*) AS c FROM fm_orders o
         WHERE ${t} AND o.order_status='paid' AND DATE(o.paid_at)=CURDATE()`
      ),
      queryAsync(
        `SELECT COALESCE(SUM(o.final_amount),0) AS s FROM fm_orders o
         WHERE ${t} AND o.order_status='paid' AND DATE(o.paid_at)=CURDATE()`
      ),
      queryAsync(
        `SELECT ROUND(AVG(o.final_amount),2) AS a FROM fm_orders o
         WHERE ${t} AND o.order_status='paid' AND o.paid_at >= ? AND o.paid_at < ?`,
        [start, end]
      )
    ]);

  const paidCount = n(paid && paid.c);
  const createdCount = n(initiated && initiated.c);
  const failedCount = n(failed && failed.c);
  const successRate =
    createdCount > 0 ? Math.round((paidCount / createdCount) * 1000) / 10 : null;

  return {
    month: selectedMonth,
    paidCount,
    gmv: n(gmv && gmv.s),
    pendingOpen: n(pending && pending.c),
    failedMonth: failedCount,
    cancelledMonth: n(cancelled && cancelled.c),
    createdMonth: createdCount,
    deliveredMonth: n(delivered && delivered.c),
    todayPaid: n(todayPaid && todayPaid.c),
    todayGmv: n(todayGmv && todayGmv.s),
    avgTicket: avgTicket && avgTicket.a != null ? n(avgTicket.a) : null,
    successRate
  };
}

async function listOrders(filters = {}) {
  await ensureSchema();
  const includeTest = !!filters.includeTest;
  const t = testClause(includeTest, 'o');
  const where = [t];
  const params = [];

  if (filters.status) {
    where.push('o.order_status = ?');
    params.push(filters.status);
  }
  if (filters.fulfillment) {
    where.push('o.fulfillment_status = ?');
    params.push(filters.fulfillment);
  }
  if (filters.productType) {
    where.push('o.product_type = ?');
    params.push(filters.productType);
  }
  if (filters.plan) {
    where.push('o.plan = ?');
    params.push(filters.plan);
  }
  if (filters.start && filters.end) {
    where.push('o.created_at >= ? AND o.created_at < ?');
    params.push(filters.start, filters.end);
  }
  const q = String(filters.q || '').trim();
  if (q) {
    where.push(
      `(o.order_id LIKE ? OR o.billing_email LIKE ? OR o.billing_tel LIKE ? OR o.billing_name LIKE ? OR o.product_name LIKE ?)`
    );
    const like = `%${q.replace(/%/g, '\\%')}%`;
    params.push(like, like, like, like, like);
  }

  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 100));
  const offset = Math.max(0, Number(filters.offset) || 0);
  params.push(limit, offset);

  const rows = await queryAsync(
    `SELECT o.id, o.order_id, o.product_type, o.plan, o.plan_label, o.addon_plan,
            o.product_name, o.seo_name, o.source_code_id,
            o.billing_name, o.billing_email, o.billing_tel,
            o.currency, o.list_amount, o.discount_amount, o.coupon_code, o.final_amount,
            o.order_status, o.fulfillment_status, o.payment_pref, o.is_test,
            o.paid_at, o.delivered_at, o.created_at
     FROM fm_orders o
     WHERE ${where.join(' AND ')}
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT ? OFFSET ?`,
    params
  );
  return rows || [];
}

async function listPayments(filters = {}) {
  await ensureSchema();
  const includeTest = !!filters.includeTest;
  const t = testClause(includeTest, 'o');
  const where = [t];
  const params = [];

  if (filters.paymentStatus) {
    where.push('p.payment_status = ?');
    params.push(filters.paymentStatus);
  }
  if (filters.gateway) {
    where.push('p.gateway = ?');
    params.push(filters.gateway);
  }
  if (filters.start && filters.end) {
    where.push('p.created_at >= ? AND p.created_at < ?');
    params.push(filters.start, filters.end);
  }
  const q = String(filters.q || '').trim();
  if (q) {
    where.push(
      `(p.order_id LIKE ? OR p.tracking_id LIKE ? OR o.billing_email LIKE ? OR o.billing_tel LIKE ? OR o.billing_name LIKE ?)`
    );
    const like = `%${q.replace(/%/g, '\\%')}%`;
    params.push(like, like, like, like, like);
  }

  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 100));
  params.push(limit);

  const rows = await queryAsync(
    `SELECT p.id, p.order_pk, p.order_id, p.attempt_no, p.gateway, p.payment_status,
            p.amount, p.currency, p.tracking_id, p.bank_ref_no, p.payment_mode,
            p.card_name, p.status_message, p.failure_message, p.gateway_order_status,
            p.initiated_at, p.completed_at, p.created_at,
            o.product_type, o.plan, o.plan_label, o.product_name,
            o.billing_name, o.billing_email, o.billing_tel, o.order_status, o.is_test
     FROM fm_payments p
     JOIN fm_orders o ON o.id = p.order_pk
     WHERE ${where.join(' AND ')}
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT ?`,
    params
  );
  return rows || [];
}

async function listExceptions({ includeTest = false, days = 14 } = {}) {
  await ensureSchema();
  const t = testClause(includeTest, 'o');
  const dayN = Math.min(90, Math.max(1, Number(days) || 14));

  const [pendingAging, failedRecent, stuckFulfillment, mismatchEvents, duplicateEvents] =
    await Promise.all([
      queryAsync(
        `SELECT o.* FROM fm_orders o
         WHERE ${t} AND o.order_status IN ('initiated','payment_pending')
           AND o.created_at < (NOW() - INTERVAL 30 MINUTE)
         ORDER BY o.created_at ASC
         LIMIT 100`
      ),
      queryAsync(
        `SELECT o.* FROM fm_orders o
         WHERE ${t} AND o.order_status IN ('failed','cancelled')
           AND o.created_at >= (NOW() - INTERVAL ? DAY)
         ORDER BY o.created_at DESC
         LIMIT 100`,
        [dayN]
      ),
      queryAsync(
        `SELECT o.* FROM fm_orders o
         WHERE ${t} AND o.order_status='paid'
           AND o.fulfillment_status IN ('pending','ready','failed')
           AND o.paid_at < (NOW() - INTERVAL 2 HOUR)
         ORDER BY o.paid_at ASC
         LIMIT 100`
      ),
      queryAsync(
        `SELECT e.*, o.billing_name, o.billing_tel, o.final_amount, o.order_status, o.is_test
         FROM fm_order_events e
         JOIN fm_orders o ON o.id = e.order_pk
         WHERE ${t} AND e.event_type='payment_amount_mismatch'
           AND e.created_at >= (NOW() - INTERVAL ? DAY)
         ORDER BY e.created_at DESC
         LIMIT 50`,
        [dayN]
      ).catch(() => []),
      queryAsync(
        `SELECT e.*, o.billing_name, o.billing_tel, o.final_amount, o.order_status, o.is_test
         FROM fm_order_events e
         JOIN fm_orders o ON o.id = e.order_pk
         WHERE ${t} AND e.event_type='payment_duplicate'
           AND e.created_at >= (NOW() - INTERVAL ? DAY)
         ORDER BY e.created_at DESC
         LIMIT 50`,
        [dayN]
      ).catch(() => [])
    ]);

  return {
    pendingAging: pendingAging || [],
    failedRecent: failedRecent || [],
    stuckFulfillment: stuckFulfillment || [],
    mismatchEvents: mismatchEvents || [],
    duplicateEvents: duplicateEvents || []
  };
}

async function getOrderDetail(orderId) {
  await ensureSchema();
  const id = String(orderId || '').trim();
  if (!id) return null;

  let orders = await queryAsync(`SELECT * FROM fm_orders WHERE order_id = ? LIMIT 1`, [id]);
  if (!orders.length && /^\d+$/.test(id)) {
    orders = await queryAsync(`SELECT * FROM fm_orders WHERE id = ? LIMIT 1`, [parseInt(id, 10)]);
  }
  if (!orders.length) return null;
  const order = orders[0];

  const [payments, events] = await Promise.all([
    queryAsync(
      `SELECT * FROM fm_payments WHERE order_pk = ? ORDER BY attempt_no ASC, id ASC`,
      [order.id]
    ),
    queryAsync(
      `SELECT * FROM fm_order_events WHERE order_pk = ? ORDER BY created_at ASC, id ASC`,
      [order.id]
    ).catch(() => [])
  ]);

  return { order, payments: payments || [], events: events || [] };
}

async function lookupOrders({ name, phone, orderId, trackingId, includeTest = false, limit = 100 } = {}) {
  await ensureSchema();
  const t = testClause(includeTest, 'o');
  const where = [t];
  const params = [];

  const nameQ = String(name || '').trim();
  const phoneQ = String(phone || '').trim().replace(/\D/g, '');
  const oid = String(orderId || '').trim();
  const tid = String(trackingId || '').trim();

  if (!nameQ && !phoneQ && !oid && !tid) return [];

  if (nameQ) {
    where.push('o.billing_name LIKE ?');
    params.push(`%${nameQ.replace(/%/g, '\\%')}%`);
  }
  if (phoneQ) {
    where.push('o.billing_tel LIKE ?');
    params.push(`%${phoneQ}%`);
  }
  if (oid) {
    where.push('o.order_id LIKE ?');
    params.push(`%${oid.replace(/%/g, '\\%')}%`);
  }
  if (tid) {
    where.push(
      `EXISTS (SELECT 1 FROM fm_payments p WHERE p.order_pk=o.id AND p.tracking_id LIKE ?)`
    );
    params.push(`%${tid.replace(/%/g, '\\%')}%`);
  }

  params.push(Math.min(100, Math.max(1, Number(limit) || 100)));

  return (
    (await queryAsync(
      `SELECT o.id, o.order_id, o.product_type, o.plan, o.plan_label, o.addon_plan,
              o.product_name, o.billing_name, o.billing_email, o.billing_tel,
              o.final_amount, o.currency, o.order_status, o.fulfillment_status,
              o.payment_pref, o.is_test, o.paid_at, o.created_at
       FROM fm_orders o
       WHERE ${where.join(' AND ')}
       ORDER BY o.created_at DESC
       LIMIT ?`,
      params
    )) || []
  );
}

async function getAnalyticsBundle(selectedMonth, { includeTest = false } = {}) {
  await ensureSchema();
  const { start, end } = monthRange(selectedMonth);
  const t = testClause(includeTest, 'o');

  const [dailyPaid, byProduct, byPlan, byPref, byMode, funnel, failReasons] = await Promise.all([
    queryAsync(
      `SELECT DATE(o.paid_at) AS d, COUNT(*) AS orders, COALESCE(SUM(o.final_amount),0) AS gmv
       FROM fm_orders o
       WHERE ${t} AND o.order_status='paid' AND o.paid_at >= ? AND o.paid_at < ?
       GROUP BY DATE(o.paid_at) ORDER BY d ASC`,
      [start, end]
    ),
    queryAsync(
      `SELECT o.product_type AS k, COUNT(*) AS orders, COALESCE(SUM(o.final_amount),0) AS gmv
       FROM fm_orders o
       WHERE ${t} AND o.order_status='paid' AND o.paid_at >= ? AND o.paid_at < ?
       GROUP BY o.product_type`,
      [start, end]
    ),
    queryAsync(
      `SELECT o.plan AS k, COUNT(*) AS orders, COALESCE(SUM(o.final_amount),0) AS gmv
       FROM fm_orders o
       WHERE ${t} AND o.order_status='paid' AND o.paid_at >= ? AND o.paid_at < ?
       GROUP BY o.plan ORDER BY gmv DESC`,
      [start, end]
    ),
    queryAsync(
      `SELECT COALESCE(o.payment_pref,'(none)') AS k, COUNT(*) AS orders, COALESCE(SUM(o.final_amount),0) AS gmv
       FROM fm_orders o
       WHERE ${t} AND o.order_status='paid' AND o.paid_at >= ? AND o.paid_at < ?
       GROUP BY COALESCE(o.payment_pref,'(none)')`,
      [start, end]
    ),
    queryAsync(
      `SELECT COALESCE(p.payment_mode,'(unknown)') AS k, COUNT(*) AS c
       FROM fm_payments p
       JOIN fm_orders o ON o.id = p.order_pk
       WHERE ${t} AND p.payment_status='success' AND p.completed_at >= ? AND p.completed_at < ?
       GROUP BY COALESCE(p.payment_mode,'(unknown)')
       ORDER BY c DESC`,
      [start, end]
    ),
    queryAsync(
      `SELECT
         SUM(CASE WHEN o.order_status IN ('initiated','payment_pending','paid','failed','cancelled','refunded') THEN 1 ELSE 0 END) AS created,
         SUM(CASE WHEN o.order_status IN ('payment_pending','paid','failed','cancelled','refunded') THEN 1 ELSE 0 END) AS pending_or_after,
         SUM(CASE WHEN o.order_status='paid' THEN 1 ELSE 0 END) AS paid,
         SUM(CASE WHEN o.order_status='failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN o.order_status='cancelled' THEN 1 ELSE 0 END) AS cancelled
       FROM fm_orders o
       WHERE ${t} AND o.created_at >= ? AND o.created_at < ?`,
      [start, end]
    ),
    queryAsync(
      `SELECT COALESCE(NULLIF(TRIM(p.failure_message),''), p.status_message, p.gateway_order_status, '(none)') AS reason,
              COUNT(*) AS c
       FROM fm_payments p
       JOIN fm_orders o ON o.id = p.order_pk
       WHERE ${t} AND p.payment_status IN ('failure','aborted','unknown')
         AND p.created_at >= ? AND p.created_at < ?
       GROUP BY reason
       ORDER BY c DESC
       LIMIT 12`,
      [start, end]
    )
  ]);

  const funnelRow = (funnel && funnel[0]) || {};
  return {
    month: selectedMonth,
    dailyPaid: dailyPaid || [],
    byProduct: byProduct || [],
    byPlan: byPlan || [],
    byPref: byPref || [],
    byMode: byMode || [],
    funnel: {
      created: n(funnelRow.created),
      pendingOrAfter: n(funnelRow.pending_or_after),
      paid: n(funnelRow.paid),
      failed: n(funnelRow.failed),
      cancelled: n(funnelRow.cancelled)
    },
    failReasons: failReasons || []
  };
}

async function markRefunded(orderId, { actorName } = {}) {
  await ensureSchema();
  const detail = await getOrderDetail(orderId);
  if (!detail) return { ok: false, message: 'Order not found' };
  const order = detail.order;
  await queryAsync(`UPDATE fm_orders SET order_status='refunded', updated_at=NOW() WHERE id=?`, [
    order.id
  ]);
  try {
    await queryAsync(`INSERT INTO fm_order_events SET ?`, {
      order_pk: order.id,
      order_id: order.order_id,
      event_type: 'order_refunded',
      event_message: `Marked refunded by ${actorName || 'admin'}`,
      meta_json: JSON.stringify({ by: actorName || 'admin' })
    });
  } catch (_) {
    /* optional */
  }
  return { ok: true };
}

async function updateFulfillment(orderId, status, { actorName } = {}) {
  await ensureSchema();
  if (!['pending', 'ready', 'delivered', 'failed'].includes(status)) {
    return { ok: false, message: 'Invalid fulfillment status' };
  }
  const detail = await getOrderDetail(orderId);
  if (!detail) return { ok: false, message: 'Order not found' };
  const order = detail.order;
  if (status === 'delivered') {
    await queryAsync(
      `UPDATE fm_orders SET fulfillment_status=?, delivered_at=COALESCE(delivered_at,NOW()), updated_at=NOW() WHERE id=?`,
      [status, order.id]
    );
  } else {
    await queryAsync(`UPDATE fm_orders SET fulfillment_status=?, updated_at=NOW() WHERE id=?`, [
      status,
      order.id
    ]);
  }
  try {
    await queryAsync(`INSERT INTO fm_order_events SET ?`, {
      order_pk: order.id,
      order_id: order.order_id,
      event_type: 'fulfillment_' + status,
      event_message: `Fulfillment set to ${status} by ${actorName || 'admin'}`,
      meta_json: JSON.stringify({ by: actorName || 'admin', status })
    });
  } catch (_) {
    /* optional */
  }
  return { ok: true };
}

module.exports = {
  ensureSchema,
  monthRange,
  countTestVsLive,
  getOverviewKpis,
  listOrders,
  listPayments,
  listExceptions,
  getOrderDetail,
  lookupOrders,
  getAnalyticsBundle,
  markRefunded,
  updateFulfillment
};
