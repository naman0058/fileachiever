'use strict';

/**
 * Enterprise Setup Support service
 * - Auto-creates CRM tickets when fm_orders with setup support become paid
 * - Idempotent via unique fm_order_id
 * - Team performance KPIs (monthly done / pending / SLA)
 */

const util = require('util');
const pool = require('../routes/pool');

const queryAsync = util.promisify(pool.query).bind(pool);

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
    // Some MySQL modes throw differently for "duplicate"
    if (e && (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_DUP_KEYNAME')) return;
    throw e;
  }
}

async function ensureSchema() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    // Table may already exist from migrations/setup_support.sql
    await queryAsync(`
      CREATE TABLE IF NOT EXISTS setup_support (
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
        plan_label VARCHAR(255) NULL,
        order_amount DECIMAL(10,2) NULL,
        origin ENUM('manual_lead','checkout') NOT NULL DEFAULT 'manual_lead',
        enquiry TEXT,
        assigned_to INT NULL,
        status ENUM('pending','in_progress','done','cancelled') NOT NULL DEFAULT 'pending',
        notes TEXT NULL,
        completed_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_setup_support_fm_order_id (fm_order_id),
        KEY idx_status (status),
        KEY idx_assigned (assigned_to),
        KEY idx_lead (lead_id),
        KEY idx_created (created_at),
        KEY idx_setup_support_completed (completed_at),
        KEY idx_setup_support_origin (origin)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await tryAlter(`ALTER TABLE setup_support MODIFY COLUMN lead_id INT NULL`);

    const cols = [
      ['fm_order_pk', 'BIGINT UNSIGNED NULL AFTER lead_id'],
      ['fm_order_id', 'VARCHAR(64) NULL AFTER fm_order_pk'],
      ['customer_email', 'VARCHAR(255) NULL AFTER customer_number'],
      ['source_code_id', 'INT NULL AFTER customer_email'],
      ['product_name', 'VARCHAR(512) NULL AFTER source_code_id'],
      ['seo_name', 'VARCHAR(255) NULL AFTER product_name'],
      ['plan_label', 'VARCHAR(255) NULL AFTER seo_name'],
      ['order_amount', 'DECIMAL(10,2) NULL AFTER plan_label'],
      ['origin', `ENUM('manual_lead','checkout') NOT NULL DEFAULT 'manual_lead' AFTER order_amount`]
    ];
    for (const [name, def] of cols) {
      if (!(await columnExists('setup_support', name))) {
        await tryAlter(`ALTER TABLE setup_support ADD COLUMN ${name} ${def}`);
      }
    }

    await tryAlter(`ALTER TABLE setup_support ADD UNIQUE KEY uq_setup_support_fm_order_id (fm_order_id)`);
    await tryAlter(`ALTER TABLE setup_support ADD KEY idx_setup_support_fm_order_pk (fm_order_pk)`);
    await tryAlter(`ALTER TABLE setup_support ADD KEY idx_setup_support_origin (origin)`);
    await tryAlter(`ALTER TABLE setup_support ADD KEY idx_setup_support_completed (completed_at)`);

    if (!(await columnExists('fm_orders', 'addon_plan'))) {
      await tryAlter(`ALTER TABLE fm_orders ADD COLUMN addon_plan VARCHAR(32) NULL AFTER plan`);
    }
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}

/**
 * Detect whether a paid checkout order includes setup support.
 */
function orderIncludesSetupSupport(order) {
  if (!order) return false;
  const plan = String(order.plan || '').toLowerCase().trim();
  const addonPlan = String(order.addon_plan || '').toLowerCase().trim();
  const label = String(order.plan_label || '').toLowerCase();

  if (plan === 'support') return true;
  if (addonPlan === 'support') return true;
  if (/setup\s*support/i.test(label)) return true;
  return false;
}

function buildEnquiry(order) {
  const lines = [
    'Checkout order — Setup Support required',
    `Order ID: ${order.order_id}`,
    `Product: ${order.product_name || '—'}`,
    `Plan: ${order.plan_label || order.plan || '—'}`,
    `Email: ${order.billing_email || '—'}`,
    `Amount: ₹${order.final_amount != null ? order.final_amount : '—'}`,
    order.seo_name ? `SEO: ${order.seo_name}` : null
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * Idempotent: create setup_support ticket for a paid fm_order when eligible.
 * Returns { created: boolean, ticket: row|null, skipped?: string }
 */
async function ensureSetupSupportForPaidOrder(order) {
  await ensureSchema();
  if (!order || !order.order_id) {
    return { created: false, ticket: null, skipped: 'missing_order' };
  }
  if (String(order.order_status || '') !== 'paid') {
    return { created: false, ticket: null, skipped: 'not_paid' };
  }
  if (!orderIncludesSetupSupport(order)) {
    return { created: false, ticket: null, skipped: 'no_setup_support' };
  }

  const existing = await queryAsync(
    `SELECT * FROM setup_support WHERE fm_order_id = ? LIMIT 1`,
    [String(order.order_id)]
  );
  if (existing && existing[0]) {
    return { created: false, ticket: existing[0], skipped: 'already_exists' };
  }

  const name = String(order.billing_name || 'Customer').trim().slice(0, 255) || 'Customer';
  const tel = String(order.billing_tel || '').replace(/\D/g, '').slice(0, 50) || '0000000000';
  const email = String(order.billing_email || '').trim().slice(0, 255) || null;

  try {
    const insert = await queryAsync(`INSERT INTO setup_support SET ?`, {
      lead_id: null,
      fm_order_pk: order.id || null,
      fm_order_id: String(order.order_id),
      customer_name: name,
      customer_number: tel,
      customer_email: email,
      source_code_id: order.source_code_id || null,
      product_name: order.product_name || null,
      seo_name: order.seo_name || null,
      plan_label: order.plan_label || null,
      order_amount: order.final_amount != null ? Number(order.final_amount) : null,
      origin: 'checkout',
      enquiry: buildEnquiry(order),
      assigned_to: null,
      status: 'pending',
      notes: null,
      completed_at: null
    });

    const ticketRows = await queryAsync(`SELECT * FROM setup_support WHERE id = ? LIMIT 1`, [
      insert.insertId
    ]);
    const ticket = ticketRows && ticketRows[0] ? ticketRows[0] : null;

    // Best-effort audit on fm_order_events (table may exist)
    try {
      await queryAsync(`INSERT INTO fm_order_events SET ?`, {
        order_pk: order.id,
        order_id: order.order_id,
        event_type: 'setup_support_created',
        event_message: 'Setup support ticket created for checkout order',
        meta_json: JSON.stringify({ setup_support_id: insert.insertId })
      });
    } catch (_) {
      /* ignore if events table missing */
    }

    return { created: true, ticket };
  } catch (e) {
    // Race: unique key conflict
    if (e && (e.code === 'ER_DUP_ENTRY' || /Duplicate entry/i.test(String(e.message || '')))) {
      const again = await queryAsync(`SELECT * FROM setup_support WHERE fm_order_id = ? LIMIT 1`, [
        String(order.order_id)
      ]);
      return { created: false, ticket: again && again[0] ? again[0] : null, skipped: 'race_exists' };
    }
    throw e;
  }
}

/**
 * Backfill tickets for historical paid support orders.
 */
async function backfillFromPaidOrders(limit = 500) {
  await ensureSchema();
  const rows = await queryAsync(
    `SELECT o.*
     FROM fm_orders o
     LEFT JOIN setup_support ss ON ss.fm_order_id = o.order_id
     WHERE o.order_status = 'paid'
       AND ss.id IS NULL
       AND (
         o.plan = 'support'
         OR o.addon_plan = 'support'
         OR o.plan_label LIKE '%setup support%'
         OR o.plan_label LIKE '%Setup Support%'
       )
     ORDER BY o.id DESC
     LIMIT ?`,
    [Math.min(2000, Math.max(1, Number(limit) || 500))]
  );

  let created = 0;
  let skipped = 0;
  for (const order of rows || []) {
    const r = await ensureSetupSupportForPaidOrder(order);
    if (r.created) created += 1;
    else skipped += 1;
  }
  return { scanned: (rows || []).length, created, skipped };
}

/**
 * Monthly team performance + overall ops KPIs.
 * @param {string} selectedMonth YYYY-MM
 * @param {{ start: string, end: string }} range
 */
async function getPerformanceBundle(selectedMonth, range) {
  await ensureSchema();
  const { start, end } = range;

  const [openPending] = await queryAsync(
    `SELECT COUNT(*) AS c FROM setup_support WHERE status IN ('pending','in_progress')`
  );
  const [openUnassigned] = await queryAsync(
    `SELECT COUNT(*) AS c FROM setup_support
     WHERE assigned_to IS NULL AND status IN ('pending','in_progress')`
  );
  const [aging24] = await queryAsync(
    `SELECT COUNT(*) AS c FROM setup_support
     WHERE status IN ('pending','in_progress')
       AND created_at < (NOW() - INTERVAL 24 HOUR)`
  );
  const [createdMonth] = await queryAsync(
    `SELECT COUNT(*) AS c FROM setup_support WHERE created_at >= ? AND created_at < ?`,
    [start, end]
  );
  const [doneMonth] = await queryAsync(
    `SELECT COUNT(*) AS c FROM setup_support
     WHERE status = 'done' AND completed_at >= ? AND completed_at < ?`,
    [start, end]
  );
  const [avgHours] = await queryAsync(
    `SELECT ROUND(AVG(TIMESTAMPDIFF(HOUR, created_at, completed_at)), 1) AS h
     FROM setup_support
     WHERE status = 'done'
       AND completed_at >= ? AND completed_at < ?
       AND completed_at IS NOT NULL`,
    [start, end]
  );
  const [checkoutMonth] = await queryAsync(
    `SELECT COUNT(*) AS c FROM setup_support
     WHERE origin = 'checkout' AND created_at >= ? AND created_at < ?`,
    [start, end]
  );

  const team = await queryAsync(
    `SELECT
       u.id,
       u.name,
       u.email,
       u.is_active,
       SUM(CASE WHEN ss.status IN ('pending','in_progress') AND ss.assigned_to = u.id THEN 1 ELSE 0 END) AS open_pending,
       SUM(CASE WHEN ss.status = 'done' AND ss.completed_at >= ? AND ss.completed_at < ? THEN 1 ELSE 0 END) AS done_month,
       SUM(CASE WHEN ss.created_at >= ? AND ss.created_at < ? AND ss.assigned_to = u.id THEN 1 ELSE 0 END) AS assigned_month,
       ROUND(AVG(CASE
         WHEN ss.status = 'done' AND ss.completed_at >= ? AND ss.completed_at < ? AND ss.completed_at IS NOT NULL
         THEN TIMESTAMPDIFF(HOUR, ss.created_at, ss.completed_at)
         ELSE NULL
       END), 1) AS avg_hours
     FROM crm_users u
     LEFT JOIN setup_support ss ON ss.assigned_to = u.id
     WHERE u.role = 'setup_support'
     GROUP BY u.id, u.name, u.email, u.is_active
     ORDER BY done_month DESC, u.name ASC`,
    [start, end, start, end, start, end]
  );

  const dailyDone = await queryAsync(
    `SELECT DATE(completed_at) AS d, COUNT(*) AS c
     FROM setup_support
     WHERE status = 'done' AND completed_at >= ? AND completed_at < ?
     GROUP BY DATE(completed_at)
     ORDER BY d ASC`,
    [start, end]
  );

  return {
    month: selectedMonth,
    range,
    kpis: {
      openPending: Number(openPending && openPending.c) || 0,
      openUnassigned: Number(openUnassigned && openUnassigned.c) || 0,
      aging24h: Number(aging24 && aging24.c) || 0,
      createdMonth: Number(createdMonth && createdMonth.c) || 0,
      doneMonth: Number(doneMonth && doneMonth.c) || 0,
      avgHours: avgHours && avgHours.h != null ? Number(avgHours.h) : null,
      checkoutMonth: Number(checkoutMonth && checkoutMonth.c) || 0
    },
    team: team || [],
    dailyDone: dailyDone || []
  };
}

module.exports = {
  ensureSchema,
  orderIncludesSetupSupport,
  ensureSetupSupportForPaidOrder,
  backfillFromPaidOrders,
  getPerformanceBundle
};
