'use strict';

const util = require('util');
const crypto = require('crypto');
const pool = require('../routes/pool');
const {
  CURRENCY_INR,
  CURRENCY_PKR,
  parseMoney,
  clientOutstandingInr,
  agentOutstandingInr,
  clientPaymentStatus,
  agentPaymentStatus,
  grossProjectProfit,
} = require('../utils/freelancingFinanceMap');

const queryAsync = util.promisify(pool.query).bind(pool);

let _hasClientPay = null;
let _hasAgentPay = null;

async function detectClientPaymentsTable() {
  if (_hasClientPay !== null) return _hasClientPay;
  try {
    const rows = await queryAsync(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_client_payments'`
    );
    _hasClientPay = rows.length > 0;
  } catch (_) {
    _hasClientPay = false;
  }
  return _hasClientPay;
}

async function detectAgentPaymentsTable() {
  if (_hasAgentPay !== null) return _hasAgentPay;
  try {
    const rows = await queryAsync(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_agent_payments'`
    );
    _hasAgentPay = rows.length > 0;
  } catch (_) {
    _hasAgentPay = false;
  }
  return _hasAgentPay;
}

function canMutateFinance(sessionAffiliation) {
  const ids = (process.env.FREELANCING_OPS_FINANCE_MANAGER_IDS || process.env.FREELANCING_OPS_MANAGER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) return true;
  return sessionAffiliation && ids.includes(String(sessionAffiliation));
}

function getConnectionAsync() {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, conn) => {
      if (err) reject(err);
      else {
        conn.queryAsync = util.promisify(conn.query).bind(conn);
        resolve(conn);
      }
    });
  });
}

function buildLeadFilter(filters, params) {
  let sql = '';
  if (filters.from) {
    sql += ' AND DATE(l.created_at) >= ?';
    params.push(filters.from);
  }
  if (filters.to) {
    sql += ' AND DATE(l.created_at) <= ?';
    params.push(filters.to);
  }
  if (filters.q) {
    const like = `%${String(filters.q).trim().replace(/%/g, '\\%')}%`;
    sql += ' AND (l.enquiry LIKE ? OR l.name LIKE ? OR CAST(l.id AS CHAR) LIKE ?)';
    params.push(like, like, like);
  }
  if (filters.client) {
    sql += ' AND l.name LIKE ?';
    params.push(`%${filters.client}%`);
  }
  if (filters.agent) {
    sql += ' AND l.assign = ?';
    params.push(filters.agent);
  }
  return sql;
}

async function sumClientPaymentsInr(leadId, conn) {
  const has = await detectClientPaymentsTable();
  if (!has) return null;
  const run = conn ? conn.queryAsync.bind(conn) : queryAsync;
  const [row] = await run(
    `SELECT COALESCE(SUM(amount),0) AS s FROM lead_client_payments WHERE lead_id = ? AND currency = 'INR'`,
    [leadId]
  );
  return Number(row?.s || 0);
}

async function sumAgentPaymentsInr(leadId, conn) {
  const has = await detectAgentPaymentsTable();
  if (!has) return null;
  const run = conn ? conn.queryAsync.bind(conn) : queryAsync;
  const [row] = await run(
    `SELECT COALESCE(SUM(amount),0) AS s FROM lead_agent_payments WHERE lead_id = ? AND currency = 'INR'`,
    [leadId]
  );
  return Number(row?.s || 0);
}

async function getFinanceOverview(filters = {}) {
  const params = [];
  const extra = buildLeadFilter(filters, params);

  const [row] = await queryAsync(
    `
    SELECT
      COALESCE(SUM(l.lead_price), 0) AS total_contracted,
      COALESCE(SUM(l.advance_amount), 0) AS payments_received_inr,
      COALESCE(SUM(GREATEST(l.lead_price - COALESCE(l.advance_amount,0), 0)), 0) AS client_outstanding,
      COALESCE(SUM(l.agent_price), 0) AS agent_cost,
      COALESCE(SUM(l.lead_price - l.agent_price), 0) AS gross_project_profit
    FROM leads l
    WHERE 1=1 ${extra}
  `,
    params
  );

  let agent_payments_made = 0;
  let agent_payables = 0;
  const hasAgentPay = await detectAgentPaymentsTable();
  if (hasAgentPay) {
    const [ap] = await queryAsync(
      `SELECT COALESCE(SUM(lap.amount),0) AS paid FROM lead_agent_payments lap WHERE lap.currency = 'INR'`
    );
    agent_payments_made = Number(ap?.paid || 0);

    const payParams = [...params];
    const [payRow] = await queryAsync(
      `
      SELECT COALESCE(SUM(GREATEST(
        COALESCE(l.agent_price, 0) - COALESCE(ap.paid, 0), 0
      )), 0) AS agent_payables
      FROM leads l
      LEFT JOIN (
        SELECT lead_id, SUM(amount) AS paid
        FROM lead_agent_payments
        WHERE currency = 'INR'
        GROUP BY lead_id
      ) ap ON ap.lead_id = l.id
      WHERE 1=1 ${extra}
    `,
      payParams
    );
    agent_payables = Number(payRow?.agent_payables || 0);
  } else {
    const [snap] = await queryAsync(`
      SELECT COALESCE(SUM(CASE WHEN is_payment_received=1 AND is_agent_payment_done=0 THEN GREATEST(agent_price,0) ELSE 0 END),0) AS ap
      FROM leads l WHERE 1=1 ${extra}
    `, params);
    agent_payables = Number(snap?.ap || 0);
  }

  return {
    total_contracted_value: Number(row?.total_contracted || 0),
    invoiced_value: null,
    invoiced_note: 'No invoicing module in freelancing ops — value shown as N/A.',
    payments_received: Number(row?.payments_received_inr || 0),
    client_outstanding: Number(row?.client_outstanding || 0),
    agent_cost: Number(row?.agent_cost || 0),
    agent_payments_made,
    agent_payables,
    gross_project_profit: Number(row?.gross_project_profit || 0),
    currency_primary: CURRENCY_INR,
    currency_pkr_field: 'pakistani_price',
    pkr_not_included_in_inr_totals: true,
  };
}

async function listClientReceivables(filters = {}, page = 1, limit = 50) {
  const params = [];
  const extra = buildLeadFilter(filters, params);
  const offset = (Math.max(1, page) - 1) * limit;

  let statusSql = '';
  if (filters.payment_status === 'paid') {
    statusSql = ' AND l.lead_price > 0 AND COALESCE(l.advance_amount,0) >= l.lead_price';
  } else if (filters.payment_status === 'partial') {
    statusSql = ' AND COALESCE(l.advance_amount,0) > 0 AND COALESCE(l.advance_amount,0) < l.lead_price';
  } else if (filters.payment_status === 'unpaid') {
    statusSql = ' AND l.lead_price > 0 AND COALESCE(l.advance_amount,0) <= 0';
  } else if (filters.payment_status === 'outstanding') {
    statusSql = ' AND l.lead_price > COALESCE(l.advance_amount,0)';
  }

  const [countRow] = await queryAsync(
    `SELECT COUNT(*) AS total FROM leads l WHERE 1=1 ${extra} ${statusSql}`,
    params
  );
  const total = Number(countRow?.total || 0);

  const rows = await queryAsync(
    `
    SELECT l.id, l.name, l.enquiry, l.lead_price, l.advance_amount, l.is_payment_received, l.pakistani_price,
      (SELECT MAX(payment_date) FROM lead_client_payments cp WHERE cp.lead_id = l.id) AS last_payment_date
    FROM leads l
    WHERE 1=1 ${extra} ${statusSql}
    ORDER BY (l.lead_price - COALESCE(l.advance_amount,0)) DESC, l.id DESC
    LIMIT ? OFFSET ?
  `,
    [...params, limit, offset]
  ).catch(async () => {
    return queryAsync(
      `SELECT l.id, l.name, l.enquiry, l.lead_price, l.advance_amount, l.is_payment_received, l.pakistani_price, NULL AS last_payment_date
       FROM leads l WHERE 1=1 ${extra} ${statusSql} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
  });

  const items = rows.map((r) => {
    const received = parseMoney(r.advance_amount) || 0;
    const outstanding = clientOutstandingInr(r, received);
    return {
      ...r,
      amount_due: parseMoney(r.lead_price) || 0,
      received_inr: received,
      outstanding_inr: outstanding,
      status: clientPaymentStatus(r, received),
      pkr_price: parseMoney(r.pakistani_price),
      currency_contract: CURRENCY_INR,
    };
  });

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
}

async function listAgentPayables(filters = {}, page = 1, limit = 50) {
  const params = [];
  const extra = buildLeadFilter(filters, params);
  const offset = (Math.max(1, page) - 1) * limit;

  let statusSql = '';
  if (filters.payment_status === 'paid') {
    statusSql = ' AND l.agent_price > 0 AND l.is_agent_payment_done = 1';
  } else if (filters.payment_status === 'outstanding') {
    statusSql = ' AND l.agent_price > 0 AND l.is_agent_payment_done = 0';
  }

  const [countRow] = await queryAsync(
    `SELECT COUNT(*) AS total FROM leads l WHERE l.agent_price > 0 ${extra} ${statusSql}`,
    params
  );
  const total = Number(countRow?.total || 0);

  const rows = await queryAsync(
    `SELECT l.id, l.enquiry, l.assign, l.agent_price, l.is_agent_payment_done, l.is_payment_received
     FROM leads l WHERE l.agent_price > 0 ${extra} ${statusSql}
     ORDER BY l.agent_price DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const items = [];
  for (const r of rows) {
    const paid = (await sumAgentPaymentsInr(r.id)) || 0;
    items.push({
      ...r,
      agreed_cost: parseMoney(r.agent_price) || 0,
      paid_inr: paid,
      outstanding_inr: agentOutstandingInr(r, paid),
      status: agentPaymentStatus(r, paid),
    });
  }

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
}

async function logFinanceActivity(conn, leadId, field, oldVal, newVal, actor, reason) {
  const run = conn.queryAsync.bind(conn);
  const has = await run(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_activity_log'`
  ).catch(() => []);
  if (!has.length) return;
  await run(
    `INSERT INTO lead_activity_log (lead_id, event_type, field_name, old_value, new_value, actor, reason) VALUES (?,?,?,?,?,?,?)`,
    [leadId, 'finance_change', field, oldVal == null ? null : String(oldVal), newVal == null ? null : String(newVal), actor, reason]
  ).catch(() =>
    run(
      `INSERT INTO lead_activity_log (lead_id, event_type, field_name, old_value, new_value, actor) VALUES (?,?,?,?,?,?)`,
      [leadId, 'finance_change', field, oldVal == null ? null : String(oldVal), newVal == null ? null : String(newVal), actor]
    )
  );
}

async function recordClientPayment(leadId, payload, actor, options = {}) {
  if (!(await detectClientPaymentsTable())) {
    return { success: false, message: 'Run migration freelancing_ops_finance.sql' };
  }

  const amount = parseMoney(payload.amount);
  if (amount == null || amount <= 0) return { success: false, message: 'Amount must be positive' };

  const currency = (payload.currency || CURRENCY_INR).toUpperCase();
  if (currency !== CURRENCY_INR && currency !== CURRENCY_PKR) {
    return { success: false, message: 'Currency must be INR or PKR' };
  }

  const paymentDate = (payload.payment_date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const idempotencyKey =
    options.idempotencyKey ||
    payload.idempotency_key ||
    (options.idempotencyKey === undefined && payload.client_token
      ? `cp_${leadId}_${payload.client_token}`
      : null);

  const conn = await getConnectionAsync();
  try {
    await conn.queryAsync('START TRANSACTION');

    if (idempotencyKey) {
      const existing = await conn.queryAsync(
        `SELECT id, lead_id, amount FROM lead_client_payments WHERE idempotency_key = ? LIMIT 1`,
        [idempotencyKey]
      );
      if (existing.length) {
        await conn.queryAsync('ROLLBACK');
        return { success: true, duplicate: true, payment_id: existing[0].id };
      }
    }

    const rows = await conn.queryAsync(
      `SELECT id, lead_price, advance_amount, is_payment_received FROM leads WHERE id = ? FOR UPDATE`,
      [leadId]
    );
    if (!rows.length) {
      await conn.queryAsync('ROLLBACK');
      return { success: false, message: 'Not found' };
    }
    const lead = rows[0];
    const oldAdvance = parseMoney(lead.advance_amount) || 0;

    await conn.queryAsync(
      `INSERT INTO lead_client_payments (lead_id, amount, currency, payment_date, reference, note, idempotency_key, recorded_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        leadId,
        amount,
        currency,
        paymentDate,
        payload.reference || null,
        payload.note || null,
        idempotencyKey,
        actor,
      ]
    );

    let newAdvance = oldAdvance;
    if (currency === CURRENCY_INR) {
      newAdvance = Math.round((oldAdvance + amount) * 100) / 100;
      const leadPrice = parseMoney(lead.lead_price) || 0;
      const fullPaid = leadPrice > 0 && newAdvance >= leadPrice;
      await conn.queryAsync(`UPDATE leads SET advance_amount = ?, is_payment_received = ? WHERE id = ?`, [
        newAdvance,
        fullPaid ? 1 : 0,
        leadId,
      ]);
      await logFinanceActivity(conn, leadId, 'advance_amount', oldAdvance, newAdvance, actor, payload.note || 'Client payment');
    }

    await conn.queryAsync('COMMIT');
    return {
      success: true,
      received_inr: currency === CURRENCY_INR ? newAdvance : oldAdvance,
      outstanding_inr: currency === CURRENCY_INR ? clientOutstandingInr(lead, newAdvance) : null,
      partial: true,
      currency,
    };
  } catch (e) {
    await conn.queryAsync('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

async function recordAgentPayment(leadId, payload, actor, options = {}) {
  if (!(await detectAgentPaymentsTable())) {
    return { success: false, message: 'Run migration freelancing_ops_finance.sql' };
  }

  const amount = parseMoney(payload.amount);
  if (amount == null || amount <= 0) return { success: false, message: 'Amount must be positive' };

  const currency = (payload.currency || CURRENCY_INR).toUpperCase();
  if (currency !== CURRENCY_INR) {
    return { success: false, message: 'Agent payments recorded in INR only in this module' };
  }

  const paymentDate = (payload.payment_date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const idempotencyKey = options.idempotencyKey || payload.idempotency_key || null;

  const conn = await getConnectionAsync();
  try {
    await conn.queryAsync('START TRANSACTION');

    if (idempotencyKey) {
      const existing = await conn.queryAsync(
        `SELECT id FROM lead_agent_payments WHERE idempotency_key = ? LIMIT 1`,
        [idempotencyKey]
      );
      if (existing.length) {
        await conn.queryAsync('ROLLBACK');
        return { success: true, duplicate: true, payment_id: existing[0].id };
      }
    }

    const rows = await conn.queryAsync(
      `SELECT id, agent_price, assign, is_agent_payment_done FROM leads WHERE id = ? FOR UPDATE`,
      [leadId]
    );
    if (!rows.length) {
      await conn.queryAsync('ROLLBACK');
      return { success: false, message: 'Not found' };
    }
    const lead = rows[0];
    const paidBefore = await sumAgentPaymentsInr(leadId, conn);

    await conn.queryAsync(
      `INSERT INTO lead_agent_payments (lead_id, agent_name, amount, currency, payment_date, reference, note, idempotency_key, recorded_by)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        leadId,
        payload.agent_name || lead.assign,
        amount,
        currency,
        paymentDate,
        payload.reference || null,
        payload.note || null,
        idempotencyKey,
        actor,
      ]
    );

    const paidAfter = Math.round((paidBefore + amount) * 100) / 100;
    const agentPrice = parseMoney(lead.agent_price) || 0;
    const fullPaid = agentPrice > 0 && paidAfter >= agentPrice;
    await conn.queryAsync(`UPDATE leads SET is_agent_payment_done = ? WHERE id = ?`, [fullPaid ? 1 : 0, leadId]);

    await logFinanceActivity(
      conn,
      leadId,
      'agent_payment',
      paidBefore,
      paidAfter,
      actor,
      payload.note || 'Agent payment'
    );

    await conn.queryAsync('COMMIT');
    return {
      success: true,
      paid_inr: paidAfter,
      outstanding_inr: agentOutstandingInr(lead, paidAfter),
      partial: !fullPaid,
    };
  } catch (e) {
    await conn.queryAsync('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

async function listPaymentHistory(leadId) {
  const client = (await detectClientPaymentsTable())
    ? await queryAsync(
        `SELECT id, 'client' AS side, amount, currency, payment_date, reference, note, recorded_by, created_at
         FROM lead_client_payments WHERE lead_id = ? ORDER BY id DESC`,
        [leadId]
      )
    : [];
  const agent = (await detectAgentPaymentsTable())
    ? await queryAsync(
        `SELECT id, 'agent' AS side, amount, currency, payment_date, reference, note, recorded_by, created_at, agent_name
         FROM lead_agent_payments WHERE lead_id = ? ORDER BY id DESC`,
        [leadId]
      )
    : [];
  return { client, agent };
}

async function reconcileFinance(filters = {}) {
  const params = [];
  const extra = buildLeadFilter(filters, params);
  const issues = [];

  const leads = await queryAsync(
    `SELECT id, name, enquiry, lead_price, advance_amount, agent_price, is_payment_received, is_agent_payment_done, pakistani_price
     FROM leads l WHERE 1=1 ${extra} LIMIT 500`,
    params
  );

  for (const lead of leads) {
    const sumClient = await sumClientPaymentsInr(lead.id);
    const advance = parseMoney(lead.advance_amount) || 0;
    if (sumClient != null && Math.abs(sumClient - advance) > 0.01) {
      issues.push({
        type: 'client_ledger_mismatch',
        lead_id: lead.id,
        enquiry: lead.enquiry,
        advance_amount: advance,
        ledger_sum_inr: sumClient,
        message: 'advance_amount does not match sum of INR client payments — review before auto-adjusting.',
      });
    }

    const received = advance;
    const out = clientOutstandingInr(lead, received);
    if (Number(lead.is_payment_received) === 1 && out > 0.01) {
      issues.push({
        type: 'client_flag_vs_balance',
        lead_id: lead.id,
        message: 'is_payment_received set but INR outstanding > 0',
        outstanding_inr: out,
      });
    }

    const agentPaid = (await sumAgentPaymentsInr(lead.id)) || 0;
    const agentOut = agentOutstandingInr(lead, agentPaid);
    if (Number(lead.is_agent_payment_done) === 1 && agentOut > 0.01) {
      issues.push({
        type: 'agent_flag_vs_balance',
        lead_id: lead.id,
        message: 'is_agent_payment_done set but agent outstanding > 0',
        outstanding_inr: agentOut,
      });
    }

    if (parseMoney(lead.lead_price) != null && parseMoney(lead.lead_price) < 0) {
      issues.push({ type: 'negative_lead_price', lead_id: lead.id });
    }
  }

  return {
    issues,
    count: issues.length,
    note: 'Discrepancies are flagged only — historical amounts are not rewritten automatically.',
  };
}

module.exports = {
  detectClientPaymentsTable,
  detectAgentPaymentsTable,
  canMutateFinance,
  getFinanceOverview,
  listClientReceivables,
  listAgentPayables,
  recordClientPayment,
  recordAgentPayment,
  listPaymentHistory,
  reconcileFinance,
  grossProjectProfit,
};
