'use strict';

const util = require('util');
const pool = require('../routes/pool');
const { enrichLeadRow } = require('../utils/freelancingOpsMap');
const { todayYmdInTz, DEFAULT_TZ } = require('../utils/freelancingOpsDates');
const {
  CLIENT_DEPENDENCY_CATEGORIES,
  normalizeDependencyType,
  canTransitionDependencyStatus,
  isOpenClientDependency,
  enrichClientDependencyFields,
} = require('../utils/freelancingClientDeps');

const queryAsync = util.promisify(pool.query).bind(pool);

let _hasLifecycle = null;
let _hasFollowUpLog = null;

async function detectClientLifecycleColumns() {
  if (_hasLifecycle !== null) return _hasLifecycle;
  try {
    const rows = await queryAsync(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'client_dependency_status'`
    );
    _hasLifecycle = rows.length > 0;
  } catch (_) {
    _hasLifecycle = false;
  }
  return _hasLifecycle;
}

async function detectFollowUpLogTable() {
  if (_hasFollowUpLog !== null) return _hasFollowUpLog;
  try {
    const rows = await queryAsync(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_follow_up_log'`
    );
    _hasFollowUpLog = rows.length > 0;
  } catch (_) {
    _hasFollowUpLog = false;
  }
  return _hasFollowUpLog;
}

function buildSearchClause(q, params) {
  if (!q || !String(q).trim()) return '';
  const like = `%${String(q).trim().replace(/%/g, '\\%')}%`;
  params.push(like, like, like, like);
  return ` AND (enquiry LIKE ? OR name LIKE ? OR number LIKE ? OR assign LIKE ?)`;
}

function applyClientQueueView(view, where, params, hasLifecycle) {
  const v = (view || 'open').toLowerCase();
  if (v === 'resolved') {
    if (hasLifecycle) {
      where.push(`client_dependency_status = 'resolved'`);
    } else {
      where.push(`client_dependency = 'none'`);
    }
    return;
  }

  where.push(`client_dependency IS NOT NULL AND client_dependency <> 'none'`);
  if (hasLifecycle) {
    where.push(`(client_dependency_status IS NULL OR client_dependency_status <> 'resolved')`);
  }

  if (v === 'follow_up_today') {
    where.push(`follow_up_due = CURDATE()`);
  } else if (v === 'follow_up_overdue') {
    where.push(`follow_up_due IS NOT NULL AND follow_up_due < CURDATE()`);
  } else if (v === 'waiting_3d') {
    where.push(
      `client_dependency_opened_at IS NOT NULL AND client_dependency_opened_at <= DATE_SUB(NOW(), INTERVAL 3 DAY)`
    );
  } else if (v === 'waiting_7d') {
    where.push(
      `client_dependency_opened_at IS NOT NULL AND client_dependency_opened_at <= DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );
  } else if (v === 'awaiting_approval') {
    where.push(`client_dependency = 'waiting_approval'`);
  } else if (v === 'awaiting_information') {
    where.push(
      `client_dependency IN ('waiting_files','waiting_project_requirements','waiting_info','waiting_clarification')`
    );
  }
}

async function listClientDependencies(options = {}) {
  const hasLifecycle = await detectClientLifecycleColumns();
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(options.limit) || 50));
  const offset = (page - 1) * limit;
  const params = [];
  const where = ['1=1'];

  applyClientQueueView(options.view || 'open', where, params, hasLifecycle);

  if (options.agent) {
    where.push('assign = ?');
    params.push(options.agent);
  }
  if (options.owner) {
    where.push('follow_up_owner = ?');
    params.push(options.owner);
  }

  const searchSql = buildSearchClause(options.q, params);
  const whereSql = where.join(' AND ') + searchSql;

  const [countRow] = await queryAsync(`SELECT COUNT(*) AS total FROM leads WHERE ${whereSql}`, params);
  const total = Number(countRow?.total || 0);

  const extraCols = hasLifecycle
    ? ', client_dependency_status, client_dependency_opened_at, client_dependency_resolved_at, follow_up_owner'
    : '';

  const rows = await queryAsync(
    `SELECT id, enquiry, name, number, assign, deadline, client_dependency, client_dependency_note,
      follow_up_due, next_action_date, delivery_stage, priority, created_at${extraCols}
     FROM leads WHERE ${whereSql}
     ORDER BY follow_up_due IS NULL, follow_up_due ASC, client_dependency_opened_at ASC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const items = rows.map((r) => ({
    ...enrichLeadRow(r),
    ...enrichClientDependencyFields(r),
  }));

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
}

async function getClientDependencyKpis() {
  const hasLifecycle = await detectClientLifecycleColumns();
  const openSql = hasLifecycle
    ? `client_dependency <> 'none' AND (client_dependency_status IS NULL OR client_dependency_status <> 'resolved')`
    : `client_dependency <> 'none'`;

  const [row] = await queryAsync(`
    SELECT
      COUNT(CASE WHEN ${openSql} THEN 1 END) AS open_dependencies,
      COUNT(CASE WHEN ${openSql} AND follow_up_due IS NOT NULL AND follow_up_due < CURDATE() THEN 1 END) AS overdue_follow_ups,
      AVG(CASE WHEN ${openSql} AND client_dependency_opened_at IS NOT NULL
        THEN TIMESTAMPDIFF(DAY, client_dependency_opened_at, NOW()) END) AS avg_days_waiting,
      COUNT(CASE WHEN ${
        hasLifecycle
          ? `client_dependency_status = 'resolved' AND client_dependency_resolved_at >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)`
          : `0`
      } THEN 1 END) AS resolved_this_week
    FROM leads
  `);

  return {
    open_dependencies: Number(row?.open_dependencies || 0),
    overdue_follow_ups: Number(row?.overdue_follow_ups || 0),
    avg_days_waiting: row?.avg_days_waiting != null ? Math.round(Number(row.avg_days_waiting) * 10) / 10 : null,
    resolved_this_week: Number(row?.resolved_this_week || 0),
    scoped_note: 'Open = dependency category set and lifecycle not resolved. Payment flags excluded.',
  };
}

async function getFollowUpReminders(limit = 10) {
  const hasLifecycle = await detectClientLifecycleColumns();
  const openSql = hasLifecycle
    ? `client_dependency <> 'none' AND (client_dependency_status IS NULL OR client_dependency_status <> 'resolved')`
    : `client_dependency <> 'none'`;

  const cap = Math.min(50, Math.max(1, Number(limit) || 10));
  const overdue = await queryAsync(
    `SELECT id, enquiry, name, follow_up_due, follow_up_owner, client_dependency
     FROM leads WHERE ${openSql} AND follow_up_due IS NOT NULL AND follow_up_due < CURDATE()
     ORDER BY follow_up_due ASC LIMIT ?`,
    [cap]
  );
  const dueToday = await queryAsync(
    `SELECT id, enquiry, name, follow_up_due, follow_up_owner, client_dependency
     FROM leads WHERE ${openSql} AND follow_up_due = CURDATE()
     ORDER BY id DESC LIMIT ?`,
    [cap]
  );

  return {
    overdue: overdue.map((r) => ({ ...r, ...enrichClientDependencyFields(r) })),
    dueToday: dueToday.map((r) => ({ ...r, ...enrichClientDependencyFields(r) })),
    counts: { overdue: overdue.length, dueToday: dueToday.length },
    in_app_only: true,
    note: 'Reminders are in-app only unless email integration is configured separately.',
  };
}

async function listFollowUpHistory(leadId, limit = 50) {
  const has = await detectFollowUpLogTable();
  if (!has) return [];
  return queryAsync(
    `SELECT id, dependency_type, dependency_status, follow_up_owner, next_follow_up, outcome, internal_note, channel, recorded_by, created_at
     FROM lead_follow_up_log WHERE lead_id = ? ORDER BY id DESC LIMIT ?`,
    [leadId, limit]
  );
}

async function insertFollowUpLog(conn, leadId, row, actor) {
  const has = await detectFollowUpLogTable();
  if (!has) return;
  const run = conn ? conn.queryAsync.bind(conn) : queryAsync;
  await run(
    `INSERT INTO lead_follow_up_log
      (lead_id, dependency_type, dependency_status, follow_up_owner, next_follow_up, outcome, internal_note, channel, recorded_by)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      leadId,
      row.dependency_type || null,
      row.dependency_status || null,
      row.follow_up_owner || null,
      row.next_follow_up || null,
      row.outcome || null,
      row.internal_note || null,
      row.channel || 'internal_note',
      actor || 'ops',
    ]
  );
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

async function openClientDependency(leadId, payload, actor) {
  const dep = normalizeDependencyType(payload.client_dependency);
  if (!dep || dep === 'none') {
    return { success: false, message: 'Select a dependency category' };
  }
  const hasLifecycle = await detectClientLifecycleColumns();
  const conn = await getConnectionAsync();
  try {
    await conn.queryAsync('START TRANSACTION');
    const rows = await conn.queryAsync(`SELECT id, client_dependency FROM leads WHERE id = ? FOR UPDATE`, [leadId]);
    if (!rows.length) {
      await conn.queryAsync('ROLLBACK');
      return { success: false, message: 'Not found' };
    }

    const updates = {
      client_dependency: dep,
      client_dependency_note: payload.client_dependency_note ?? undefined,
      follow_up_owner: payload.follow_up_owner || null,
      follow_up_due: payload.follow_up_due || null,
    };
    if (hasLifecycle) {
      updates.client_dependency_status = payload.follow_up_due ? 'follow_up_scheduled' : 'open';
      updates.client_dependency_opened_at = new Date();
      updates.client_dependency_resolved_at = null;
    }

    const setParts = [];
    const params = [];
    Object.entries(updates).forEach(([k, v]) => {
      if (v === undefined) return;
      setParts.push('?? = ?');
      params.push(k, v);
    });
    params.push(leadId);
    await conn.queryAsync(`UPDATE leads SET ${setParts.join(', ')} WHERE id = ?`, params);

    await insertFollowUpLog(
      conn,
      leadId,
      {
        dependency_type: dep,
        dependency_status: hasLifecycle ? updates.client_dependency_status : 'open',
        follow_up_owner: payload.follow_up_owner,
        next_follow_up: payload.follow_up_due,
        internal_note: payload.internal_note || payload.client_dependency_note,
        outcome: 'Dependency opened',
        channel: 'internal_note',
      },
      actor
    );

    await conn.queryAsync('COMMIT');
    return { success: true };
  } catch (e) {
    await conn.queryAsync('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

async function recordFollowUp(leadId, payload, actor) {
  const hasLifecycle = await detectClientLifecycleColumns();
  const conn = await getConnectionAsync();
  try {
    await conn.queryAsync('START TRANSACTION');
    const rows = await conn.queryAsync(
      `SELECT id, client_dependency, client_dependency_status, follow_up_owner FROM leads WHERE id = ? FOR UPDATE`,
      [leadId]
    );
    if (!rows.length) {
      await conn.queryAsync('ROLLBACK');
      return { success: false, message: 'Not found' };
    }
    const existing = rows[0];
    if (normalizeDependencyType(existing.client_dependency) === 'none') {
      await conn.queryAsync('ROLLBACK');
      return { success: false, message: 'No open dependency on this work item' };
    }

    const owner = payload.follow_up_owner || existing.follow_up_owner || null;
    const nextDue = payload.next_follow_up || payload.follow_up_due || null;
    let nextStatus = payload.client_dependency_status;
    if (hasLifecycle && !nextStatus) {
      nextStatus = nextDue ? 'follow_up_scheduled' : 'awaiting_response';
    }
    if (hasLifecycle && nextStatus) {
      const from = (existing.client_dependency_status || 'open').toLowerCase();
      if (!canTransitionDependencyStatus(from, nextStatus)) {
        await conn.queryAsync('ROLLBACK');
        return { success: false, message: `Status transition ${from} → ${nextStatus} not allowed` };
      }
    }

    const setParts = ['follow_up_owner = ?'];
    const params = [owner];
    if (nextDue) {
      setParts.push('follow_up_due = ?');
      params.push(nextDue);
    }
    if (payload.internal_note != null) {
      setParts.push('client_dependency_note = ?');
      params.push(payload.internal_note);
    }
    if (hasLifecycle && nextStatus) {
      setParts.push('client_dependency_status = ?');
      params.push(nextStatus);
    }
    params.push(leadId);
    await conn.queryAsync(`UPDATE leads SET ${setParts.join(', ')} WHERE id = ?`, params);

    await insertFollowUpLog(
      conn,
      leadId,
      {
        dependency_type: existing.client_dependency,
        dependency_status: nextStatus || existing.client_dependency_status,
        follow_up_owner: owner,
        next_follow_up: nextDue,
        outcome: payload.outcome || null,
        internal_note: payload.internal_note || null,
        channel: payload.channel || 'internal_note',
      },
      actor
    );

    if (payload.resolve === true || payload.outcome === 'resolved') {
      await applyResolve(conn, leadId, actor, payload.outcome || 'Resolved via follow-up');
    }
    await conn.queryAsync('COMMIT');
    return { success: true };
  } catch (e) {
    await conn.queryAsync('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

async function applyResolve(conn, leadId, actor, note) {
  const hasLifecycle = await detectClientLifecycleColumns();
  const rows = await conn.queryAsync(`SELECT client_dependency FROM leads WHERE id = ?`, [leadId]);
  if (!rows.length) return;

  if (hasLifecycle) {
    await conn.queryAsync(
      `UPDATE leads SET client_dependency = 'none', client_dependency_status = 'resolved',
       client_dependency_resolved_at = NOW(), follow_up_due = NULL WHERE id = ?`,
      [leadId]
    );
  } else {
    await conn.queryAsync(`UPDATE leads SET client_dependency = 'none', follow_up_due = NULL WHERE id = ?`, [leadId]);
  }

  await insertFollowUpLog(
    conn,
    leadId,
    {
      dependency_type: rows[0].client_dependency,
      dependency_status: 'resolved',
      outcome: note || 'Dependency resolved',
      internal_note: note || null,
      channel: 'internal_note',
    },
    actor
  );
}

async function resolveClientDependency(leadId, actor, note) {
  const conn = await getConnectionAsync();
  try {
    await conn.queryAsync('START TRANSACTION');
    await conn.queryAsync(`SELECT id FROM leads WHERE id = ? FOR UPDATE`, [leadId]);
    await applyResolve(conn, leadId, actor, note);
    await conn.queryAsync('COMMIT');
    return { success: true };
  } catch (e) {
    await conn.queryAsync('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

async function reopenClientDependency(leadId, payload, actor) {
  return openClientDependency(
    leadId,
    {
      client_dependency: payload.client_dependency,
      client_dependency_note: payload.client_dependency_note,
      follow_up_owner: payload.follow_up_owner,
      follow_up_due: payload.follow_up_due,
      internal_note: payload.internal_note || 'Dependency reopened',
    },
    actor
  );
}

async function transitionDependencyStatus(leadId, toStatus, actor, options = {}) {
  const hasLifecycle = await detectClientLifecycleColumns();
  if (!hasLifecycle) return { success: false, message: 'Lifecycle columns not migrated' };
  const conn = await getConnectionAsync();
  try {
    await conn.queryAsync('START TRANSACTION');
    const rows = await conn.queryAsync(
      `SELECT client_dependency, client_dependency_status FROM leads WHERE id = ? FOR UPDATE`,
      [leadId]
    );
    if (!rows.length) {
      await conn.queryAsync('ROLLBACK');
      return { success: false, message: 'Not found' };
    }
    const from = (rows[0].client_dependency_status || 'open').toLowerCase();
    const to = toStatus.toLowerCase();
    if (!canTransitionDependencyStatus(from, to)) {
      await conn.queryAsync('ROLLBACK');
      return { success: false, message: `Transition ${from} → ${to} not allowed` };
    }
    if (to === 'resolved') {
      await applyResolve(conn, leadId, actor, options.note || 'Resolved');
      await conn.queryAsync('COMMIT');
      return { success: true };
    }
    await conn.queryAsync(`UPDATE leads SET client_dependency_status = ? WHERE id = ?`, [to, leadId]);
    await insertFollowUpLog(
      conn,
      leadId,
      {
        dependency_type: rows[0].client_dependency,
        dependency_status: to,
        internal_note: options.note || null,
        outcome: `Status → ${to}`,
      },
      actor
    );
    await conn.queryAsync('COMMIT');
    return { success: true };
  } catch (e) {
    await conn.queryAsync('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = {
  CLIENT_DEPENDENCY_CATEGORIES,
  detectClientLifecycleColumns,
  listClientDependencies,
  getClientDependencyKpis,
  getFollowUpReminders,
  listFollowUpHistory,
  openClientDependency,
  recordFollowUp,
  resolveClientDependency,
  reopenClientDependency,
  transitionDependencyStatus,
  enrichClientDependencyFields,
};
