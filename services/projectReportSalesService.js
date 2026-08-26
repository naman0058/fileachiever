'use strict';

/**
 * Project Report Sales — tickets from paid report checkout orders.
 * Isolated from Freelancing Sales CRM and from PRM/PRC portals.
 */

const util = require('util');
const pool = require('../routes/pool');

const queryAsync = util.promisify(pool.query).bind(pool);

const REPORT_PLANS = new Set(['synopsis', 'report', 'customized', 'originality']);
const OPEN_STATUSES = ['pending', 'claimed', 'in_progress', 'waiting_customer', 'ready_to_deliver'];
const OPEN_SQL = `('pending','claimed','in_progress','waiting_customer','ready_to_deliver')`;

let ensurePromise = null;

function columnExists(table, column) {
  return queryAsync(
    `SELECT 1 AS ok FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  ).then((rows) => !!(rows && rows[0]));
}

async function tryAlter(sql) {
  try {
    await queryAsync(sql);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (/Duplicate column|Duplicate key|check that column\/key exists|Can't DROP|already exists/i.test(msg)) {
      return;
    }
    if (e && (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_DUP_KEYNAME')) return;
    throw e;
  }
}

function normalizeReportPlan(plan) {
  const p = String(plan || '').toLowerCase().trim();
  if (p === 'synopsis') return 'synopsis';
  if (p === 'customized') return 'customized';
  if (p === 'originality' || p === 'ai' || p === 'original') return 'originality';
  if (p === 'report' || p === 'predefined' || p === 'pre_defined' || p === 'project_report') return 'report';
  return null;
}

function isInstantPlan(plan) {
  const p = normalizeReportPlan(plan);
  return p === 'synopsis' || p === 'report';
}

function isDeferredPlan(plan) {
  const p = normalizeReportPlan(plan);
  return p === 'customized' || p === 'originality';
}

function planLabelFor(plan) {
  switch (normalizeReportPlan(plan)) {
    case 'synopsis':
      return 'Synopsis';
    case 'report':
      return 'Pre Defined Project Report';
    case 'customized':
      return 'Customized Report';
    case 'originality':
      return 'Originality Verified Report';
    default:
      return 'Project Report';
  }
}

function resolveReportPlanFromOrder(order) {
  if (!order) return null;
  const productType = String(order.product_type || '').toLowerCase().trim();
  const plan = String(order.plan || '').toLowerCase().trim();
  const addon = String(order.addon_plan || '').toLowerCase().trim();

  if (productType === 'report') {
    return normalizeReportPlan(plan) || 'report';
  }

  const fromAddon = normalizeReportPlan(addon);
  if (fromAddon) return fromAddon;

  const label = String(order.plan_label || '').toLowerCase();
  if (/originality|original\s*reviewed/.test(label)) return 'originality';
  if (/customized/.test(label)) return 'customized';
  if (/synopsis/.test(label) && productType === 'report') return 'synopsis';
  if (/pre\s*defined/.test(label) && productType === 'report') return 'report';

  return null;
}

function orderIncludesProjectReport(order) {
  return !!resolveReportPlanFromOrder(order);
}

function slaHoursForPlan(plan) {
  return isDeferredPlan(plan) ? 48 : 24;
}

function computeSlaDueAt(fromDate, plan) {
  const base = fromDate ? new Date(fromDate) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  const due = new Date(base.getTime() + slaHoursForPlan(plan) * 3600 * 1000);
  return due.toISOString().slice(0, 19).replace('T', ' ');
}

function delayBucket(row, now = new Date()) {
  if (!row || ['delivered', 'cancelled'].includes(String(row.status))) return 'closed';
  if (!row.sla_due_at) return 'on_track';
  const due = new Date(row.sla_due_at);
  if (Number.isNaN(due.getTime())) return 'on_track';
  const ms = due.getTime() - now.getTime();
  if (ms < 0) return 'overdue';
  if (ms <= 6 * 3600 * 1000) return 'due_soon';
  return 'on_track';
}

async function ensureSchema() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await queryAsync(`
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
          'pending','claimed','in_progress','waiting_customer',
          'ready_to_deliver','delivered','cancelled'
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    if (!(await columnExists('fm_orders', 'addon_plan'))) {
      await tryAlter(`ALTER TABLE fm_orders ADD COLUMN addon_plan VARCHAR(32) NULL AFTER plan`);
    }
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}

function buildEnquiry(order, reportPlan) {
  const lines = [
    'Checkout order — Project Report Sales',
    `Order ID: ${order.order_id}`,
    `Product: ${order.product_name || '—'}`,
    `Report plan: ${planLabelFor(reportPlan)}`,
    `Email: ${order.billing_email || '—'}`,
    order.seo_name ? `SEO: ${order.seo_name}` : null,
    isDeferredPlan(reportPlan)
      ? 'Delivery: Customized / Originality — handle in pipeline (24–48h SLA).'
      : 'Delivery: Instant plan — assist with regenerate/share if customer has issues.'
  ].filter(Boolean);
  return lines.join('\n');
}

async function ensurePrsTicketForPaidOrder(order) {
  await ensureSchema();
  if (!order || !order.order_id) {
    return { created: false, ticket: null, skipped: 'missing_order' };
  }
  if (String(order.order_status || '') !== 'paid') {
    return { created: false, ticket: null, skipped: 'not_paid' };
  }

  const reportPlan = resolveReportPlanFromOrder(order);
  if (!reportPlan || !REPORT_PLANS.has(reportPlan)) {
    return { created: false, ticket: null, skipped: 'no_report_plan' };
  }

  const existing = await queryAsync(`SELECT * FROM prs_orders WHERE fm_order_id = ? LIMIT 1`, [
    String(order.order_id)
  ]);
  if (existing && existing[0]) {
    return { created: false, ticket: existing[0], skipped: 'already_exists' };
  }

  const name = String(order.billing_name || 'Customer').trim().slice(0, 255) || 'Customer';
  const tel = String(order.billing_tel || '').replace(/\D/g, '').slice(0, 50) || '0000000000';
  const email = String(order.billing_email || '').trim().slice(0, 255) || null;
  const paidAt = order.paid_at || order.updated_at || new Date();
  const label = order.plan_label || planLabelFor(reportPlan);
  const instant = isInstantPlan(reportPlan);

  try {
    const insert = await queryAsync(`INSERT INTO prs_orders SET ?`, {
      lead_id: null,
      fm_order_pk: order.id || null,
      fm_order_id: String(order.order_id),
      customer_name: name,
      customer_number: tel,
      customer_email: email,
      source_code_id: order.source_code_id || null,
      product_name: order.product_name || null,
      seo_name: order.seo_name || null,
      plan: reportPlan,
      plan_label: String(label).slice(0, 255),
      origin: 'checkout',
      enquiry: buildEnquiry(order, reportPlan),
      assigned_to: null,
      // Instant plans (synopsis / predefined) auto-deliver; ticket kept for assist download/share
      status: instant ? 'delivered' : 'pending',
      priority: isDeferredPlan(reportPlan) ? 1 : 0,
      sla_due_at: instant ? null : computeSlaDueAt(paidAt, reportPlan),
      claimed_at: null,
      delivered_at: instant ? new Date() : null,
      notes: instant
        ? 'Auto-delivered (instant download). Use Word download if customer has an issue.'
        : null,
      delivery_note: null,
      delivery_link: null
    });

    const ticketRows = await queryAsync(`SELECT * FROM prs_orders WHERE id = ? LIMIT 1`, [
      insert.insertId
    ]);
    const ticket = ticketRows && ticketRows[0] ? ticketRows[0] : null;

    try {
      await queryAsync(`INSERT INTO fm_order_events SET ?`, {
        order_pk: order.id,
        order_id: order.order_id,
        event_type: 'prs_ticket_created',
        event_message: 'Project Report Sales ticket created',
        meta_json: JSON.stringify({ prs_order_id: insert.insertId, plan: reportPlan })
      });
    } catch (_) {
      /* optional */
    }

    return { created: true, ticket };
  } catch (e) {
    if (e && (e.code === 'ER_DUP_ENTRY' || /Duplicate entry/i.test(String(e.message || '')))) {
      const again = await queryAsync(`SELECT * FROM prs_orders WHERE fm_order_id = ? LIMIT 1`, [
        String(order.order_id)
      ]);
      return { created: false, ticket: again && again[0] ? again[0] : null, skipped: 'race_exists' };
    }
    throw e;
  }
}

async function backfillFromPaidOrders(limit = 500) {
  await ensureSchema();
  const lim = Math.min(2000, Math.max(1, Number(limit) || 500));
  const rows = await queryAsync(
    `SELECT o.*
     FROM fm_orders o
     LEFT JOIN prs_orders p ON p.fm_order_id = o.order_id
     WHERE o.order_status = 'paid'
       AND p.id IS NULL
       AND (
         o.product_type = 'report'
         OR o.addon_plan IN ('synopsis','report','customized','originality','ai','original')
         OR o.plan_label LIKE '%Synopsis%'
         OR o.plan_label LIKE '%Customized Report%'
         OR o.plan_label LIKE '%Originality%'
         OR o.plan_label LIKE '%Pre Defined Project Report%'
       )
     ORDER BY o.id DESC
     LIMIT ?`,
    [lim]
  );

  let created = 0;
  let skipped = 0;
  let fixedInstant = 0;
  for (const order of rows || []) {
    const r = await ensurePrsTicketForPaidOrder(order);
    if (r.created) created += 1;
    else skipped += 1;
  }

  // Instant plans stuck as open → mark delivered (assist-only tickets)
  const fix = await queryAsync(
    `UPDATE prs_orders
     SET status = 'delivered',
         delivered_at = COALESCE(delivered_at, created_at, NOW()),
         sla_due_at = NULL,
         notes = COALESCE(
           NULLIF(TRIM(notes), ''),
           'Auto-delivered (instant download). Use Word download if customer has an issue.'
         ),
         updated_at = NOW()
     WHERE plan IN ('synopsis','report')
       AND status IN ('pending','claimed','in_progress','waiting_customer','ready_to_deliver')`
  );
  fixedInstant = Number(fix && fix.affectedRows) || 0;

  return { scanned: (rows || []).length, created, skipped, fixedInstant };
}

function monthRange(selectedMonth) {
  const start = `${selectedMonth}-01`;
  const [y, m] = selectedMonth.split('-').map(Number);
  const endDate = new Date(y, m, 1);
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

async function getAdminKpiBundle(selectedMonth) {
  await ensureSchema();
  const range = monthRange(selectedMonth);
  const { start, end } = range;

  const [[open], [unassigned], [overdue], [dueSoon], [createdMonth], [deliveredMonth], [avgHours]] =
    await Promise.all([
      queryAsync(`SELECT COUNT(*) AS c FROM prs_orders WHERE status IN ${OPEN_SQL}`),
      queryAsync(
        `SELECT COUNT(*) AS c FROM prs_orders WHERE assigned_to IS NULL AND status IN ${OPEN_SQL}`
      ),
      queryAsync(
        `SELECT COUNT(*) AS c FROM prs_orders
         WHERE status IN ${OPEN_SQL} AND sla_due_at IS NOT NULL AND sla_due_at < NOW()`
      ),
      queryAsync(
        `SELECT COUNT(*) AS c FROM prs_orders
         WHERE status IN ${OPEN_SQL}
           AND sla_due_at IS NOT NULL
           AND sla_due_at >= NOW()
           AND sla_due_at <= (NOW() + INTERVAL 6 HOUR)`
      ),
      queryAsync(`SELECT COUNT(*) AS c FROM prs_orders WHERE created_at >= ? AND created_at < ?`, [
        start,
        end
      ]),
      queryAsync(
        `SELECT COUNT(*) AS c FROM prs_orders
         WHERE status = 'delivered' AND delivered_at >= ? AND delivered_at < ?`,
        [start, end]
      ),
      queryAsync(
        `SELECT ROUND(AVG(TIMESTAMPDIFF(HOUR, created_at, delivered_at)), 1) AS h
         FROM prs_orders
         WHERE status = 'delivered' AND delivered_at >= ? AND delivered_at < ?
           AND delivered_at IS NOT NULL`,
        [start, end]
      )
    ]);

  const byPlan = await queryAsync(
    `SELECT plan,
       SUM(CASE WHEN status IN ${OPEN_SQL} THEN 1 ELSE 0 END) AS open_c,
       SUM(CASE WHEN status = 'delivered' AND delivered_at >= ? AND delivered_at < ? THEN 1 ELSE 0 END) AS done_c,
       SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS created_c,
       SUM(CASE WHEN status IN ${OPEN_SQL} AND sla_due_at < NOW() THEN 1 ELSE 0 END) AS overdue_c
     FROM prs_orders
     GROUP BY plan`,
    [start, end, start, end]
  );

  const byStatus = await queryAsync(
    `SELECT status, COUNT(*) AS c FROM prs_orders GROUP BY status`
  );

  const team = await queryAsync(
    `SELECT
       u.id, u.name, u.email, u.is_active,
       SUM(CASE WHEN p.status IN ${OPEN_SQL} AND p.assigned_to = u.id THEN 1 ELSE 0 END) AS open_c,
       SUM(CASE WHEN p.status = 'delivered' AND p.delivered_at >= ? AND p.delivered_at < ? THEN 1 ELSE 0 END) AS done_month,
       SUM(CASE WHEN p.assigned_to = u.id AND p.claimed_at >= ? AND p.claimed_at < ? THEN 1 ELSE 0 END) AS claimed_month,
       SUM(CASE WHEN p.status IN ${OPEN_SQL} AND p.assigned_to = u.id AND p.sla_due_at < NOW() THEN 1 ELSE 0 END) AS overdue_c,
       ROUND(AVG(CASE
         WHEN p.status = 'delivered' AND p.delivered_at >= ? AND p.delivered_at < ? AND p.delivered_at IS NOT NULL
         THEN TIMESTAMPDIFF(HOUR, p.created_at, p.delivered_at)
         ELSE NULL
       END), 1) AS avg_hours
     FROM crm_users u
     LEFT JOIN prs_orders p ON p.assigned_to = u.id
     WHERE u.role = 'report_sales'
     GROUP BY u.id, u.name, u.email, u.is_active
     ORDER BY done_month DESC, u.name ASC`,
    [start, end, start, end, start, end]
  );

  const dailyDone = await queryAsync(
    `SELECT DATE(delivered_at) AS d, COUNT(*) AS c
     FROM prs_orders
     WHERE status = 'delivered' AND delivered_at >= ? AND delivered_at < ?
     GROUP BY DATE(delivered_at)
     ORDER BY d ASC`,
    [start, end]
  );

  const dailyCreated = await queryAsync(
    `SELECT DATE(created_at) AS d, COUNT(*) AS c
     FROM prs_orders
     WHERE created_at >= ? AND created_at < ?
     GROUP BY DATE(created_at)
     ORDER BY d ASC`,
    [start, end]
  );

  return {
    month: selectedMonth,
    range,
    kpis: {
      open: Number(open && open.c) || 0,
      unassigned: Number(unassigned && unassigned.c) || 0,
      overdue: Number(overdue && overdue.c) || 0,
      dueSoon: Number(dueSoon && dueSoon.c) || 0,
      createdMonth: Number(createdMonth && createdMonth.c) || 0,
      deliveredMonth: Number(deliveredMonth && deliveredMonth.c) || 0,
      avgHours: avgHours && avgHours.h != null ? Number(avgHours.h) : null
    },
    byPlan: byPlan || [],
    byStatus: byStatus || [],
    team: team || [],
    dailyDone: dailyDone || [],
    dailyCreated: dailyCreated || []
  };
}

async function getMemberPerformance(userId, selectedMonth) {
  await ensureSchema();
  const { start, end } = monthRange(selectedMonth);

  const [[open], [inProg], [doneLife], [doneMonth], [claimedMonth], [avgHours], [overdue], [available]] =
    await Promise.all([
      queryAsync(
        `SELECT COUNT(*) AS c FROM prs_orders WHERE assigned_to = ? AND status IN ${OPEN_SQL}`,
        [userId]
      ),
      queryAsync(
        `SELECT COUNT(*) AS c FROM prs_orders
         WHERE assigned_to = ? AND status IN ('claimed','in_progress','waiting_customer','ready_to_deliver')`,
        [userId]
      ),
      queryAsync(`SELECT COUNT(*) AS c FROM prs_orders WHERE assigned_to = ? AND status = 'delivered'`, [
        userId
      ]),
      queryAsync(
        `SELECT COUNT(*) AS c FROM prs_orders
         WHERE assigned_to = ? AND status = 'delivered' AND delivered_at >= ? AND delivered_at < ?`,
        [userId, start, end]
      ),
      queryAsync(
        `SELECT COUNT(*) AS c FROM prs_orders
         WHERE assigned_to = ? AND claimed_at >= ? AND claimed_at < ?`,
        [userId, start, end]
      ),
      queryAsync(
        `SELECT ROUND(AVG(TIMESTAMPDIFF(HOUR, created_at, delivered_at)), 1) AS h
         FROM prs_orders
         WHERE assigned_to = ? AND status = 'delivered'
           AND delivered_at >= ? AND delivered_at < ? AND delivered_at IS NOT NULL`,
        [userId, start, end]
      ),
      queryAsync(
        `SELECT COUNT(*) AS c FROM prs_orders
         WHERE assigned_to = ? AND status IN ${OPEN_SQL}
           AND sla_due_at IS NOT NULL AND sla_due_at < NOW()`,
        [userId]
      ),
      queryAsync(
        `SELECT COUNT(*) AS c FROM prs_orders WHERE assigned_to IS NULL AND status IN ${OPEN_SQL}`
      )
    ]);

  const dailyDone = await queryAsync(
    `SELECT DATE(delivered_at) AS d, COUNT(*) AS c
     FROM prs_orders
     WHERE assigned_to = ? AND status = 'delivered'
       AND delivered_at >= ? AND delivered_at < ?
     GROUP BY DATE(delivered_at)
     ORDER BY d ASC`,
    [userId, start, end]
  );

  const byPlan = await queryAsync(
    `SELECT plan,
       SUM(CASE WHEN status IN ${OPEN_SQL} THEN 1 ELSE 0 END) AS open_c,
       SUM(CASE WHEN status = 'delivered' AND delivered_at >= ? AND delivered_at < ? THEN 1 ELSE 0 END) AS done_c
     FROM prs_orders
     WHERE assigned_to = ?
     GROUP BY plan`,
    [start, end, userId]
  );

  return {
    month: selectedMonth,
    open: Number(open && open.c) || 0,
    inProgress: Number(inProg && inProg.c) || 0,
    doneLifetime: Number(doneLife && doneLife.c) || 0,
    doneMonth: Number(doneMonth && doneMonth.c) || 0,
    claimedMonth: Number(claimedMonth && claimedMonth.c) || 0,
    avgHours: avgHours && avgHours.h != null ? Number(avgHours.h) : null,
    overdue: Number(overdue && overdue.c) || 0,
    available: Number(available && available.c) || 0,
    dailyDone: dailyDone || [],
    byPlan: byPlan || []
  };
}

function orderIncludesSource(order) {
  if (!order) return false;
  if (String(order.product_type || '').toLowerCase() === 'source') return true;
  const label = String(order.plan_label || '').toLowerCase();
  if (/source\s*code/.test(label)) return true;
  const addon = String(order.addon_plan || '').toLowerCase();
  if (addon === 'basic' || addon === 'support') return true;
  return false;
}

function orderIncludesSetup(order) {
  if (!order) return false;
  if (String(order.plan || '').toLowerCase() === 'support') return true;
  if (String(order.addon_plan || '').toLowerCase() === 'support') return true;
  return /setup\s*support/i.test(String(order.plan_label || ''));
}

function orderIncludesReportPurchase(order) {
  if (!order) return false;
  if (String(order.product_type || '').toLowerCase() === 'report') return true;
  const addon = normalizeReportPlan(order.addon_plan);
  if (addon) return true;
  const label = String(order.plan_label || '').toLowerCase();
  return /synopsis|customized|originality|pre\s*defined|project report/.test(label);
}

function sourceZipUrl(zipFile) {
  const zip = String(zipFile || '').trim();
  if (!zip) return '';
  const base = zip.split(/[/\\]/).pop();
  if (!base) return '';
  return 'https://filemakr.com/images/' + encodeURIComponent(base);
}

function decorateFmOrder(row) {
  if (!row) return null;
  const hasSource = orderIncludesSource(row);
  const hasSetup = orderIncludesSetup(row);
  const hasReport = orderIncludesReportPurchase(row);
  const reportPlan = resolveReportPlanFromOrder(row);
  const items = [];
  if (hasSource) {
    items.push(String(row.plan || '').toLowerCase() === 'support' || hasSetup
      ? 'Source code + Setup support'
      : 'Source code');
  } else if (hasSetup) {
    items.push('Setup support');
  }
  if (hasReport) {
    items.push(planLabelFor(reportPlan || row.plan) || 'Project report');
  }
  if (!items.length && row.plan_label) items.push(String(row.plan_label));

  return {
    ...row,
    hasSource,
    hasSetup,
    hasReport,
    reportPlan,
    purchaseItems: items,
    zipUrl: sourceZipUrl(row.zip_file || row.source_code_zip),
    // never expose money in UI helpers
    list_amount: undefined,
    discount_amount: undefined,
    final_amount: undefined
  };
}

async function listSourceOrders(limit = 100) {
  await ensureSchema();
  const lim = Math.min(100, Math.max(1, Number(limit) || 100));
  const rows = await queryAsync(
    `SELECT
       o.id, o.order_id, o.product_type, o.plan, o.plan_label, o.addon_plan,
       o.source_code_id, o.product_name, o.seo_name,
       o.billing_name, o.billing_email, o.billing_tel,
       o.order_status, o.fulfillment_status, o.paid_at, o.created_at,
       sc.source_code AS zip_file, sc.name AS sc_name
     FROM fm_orders o
     LEFT JOIN source_code sc ON sc.id = o.source_code_id
     WHERE o.order_status = 'paid'
       AND (
         o.product_type = 'source'
         OR o.plan IN ('basic','support')
         OR o.addon_plan IN ('basic','support')
         OR o.plan_label LIKE '%Source code%'
         OR o.plan_label LIKE '%setup support%'
         OR o.plan_label LIKE '%Setup Support%'
       )
     ORDER BY COALESCE(o.paid_at, o.created_at) DESC, o.id DESC
     LIMIT ?`,
    [lim]
  );
  return (rows || []).map(decorateFmOrder);
}

async function lookupPaidOrders({ name, phone, limit = 100 }) {
  await ensureSchema();
  const nameQ = String(name || '').trim();
  const phoneQ = String(phone || '').trim().replace(/\D/g, '');
  if (!nameQ && !phoneQ) return [];

  const where = [`o.order_status = 'paid'`];
  const params = [];
  if (nameQ) {
    where.push('o.billing_name LIKE ?');
    params.push(`%${nameQ.replace(/%/g, '\\%')}%`);
  }
  if (phoneQ) {
    where.push('o.billing_tel LIKE ?');
    params.push(`%${phoneQ}%`);
  }
  params.push(Math.min(100, Math.max(1, Number(limit) || 100)));

  const rows = await queryAsync(
    `SELECT
       o.id, o.order_id, o.product_type, o.plan, o.plan_label, o.addon_plan,
       o.source_code_id, o.product_name, o.seo_name,
       o.billing_name, o.billing_email, o.billing_tel,
       o.order_status, o.fulfillment_status, o.paid_at, o.created_at,
       sc.source_code AS zip_file, sc.name AS sc_name,
       p.id AS prs_id, p.status AS prs_status, p.plan AS prs_plan, p.assigned_to AS prs_assigned_to
     FROM fm_orders o
     LEFT JOIN source_code sc ON sc.id = o.source_code_id
     LEFT JOIN prs_orders p ON p.fm_order_id = o.order_id
     WHERE ${where.join(' AND ')}
     ORDER BY COALESCE(o.paid_at, o.created_at) DESC, o.id DESC
     LIMIT ?`,
    params
  );
  return (rows || []).map(decorateFmOrder);
}

module.exports = {
  ensureSchema,
  normalizeReportPlan,
  isInstantPlan,
  isDeferredPlan,
  planLabelFor,
  resolveReportPlanFromOrder,
  orderIncludesProjectReport,
  orderIncludesSource,
  orderIncludesSetup,
  delayBucket,
  ensurePrsTicketForPaidOrder,
  backfillFromPaidOrders,
  getAdminKpiBundle,
  getMemberPerformance,
  monthRange,
  listSourceOrders,
  lookupPaidOrders,
  sourceZipUrl,
  decorateFmOrder,
  OPEN_STATUSES,
  REPORT_PLANS
};
