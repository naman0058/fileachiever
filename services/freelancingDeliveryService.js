'use strict';

const util = require('util');
const pool = require('../routes/pool');
const { enrichLeadRow, deriveDeliveryStage, DELIVERY_STAGES } = require('../utils/freelancingOpsMap');
const { deliveryEventForStage } = require('../utils/freelancingDeliveryEvents');
const { summarizeDeliveryRisk } = require('../utils/freelancingDeliveryRisk');

const queryAsync = util.promisify(pool.query).bind(pool);

function activeWorkSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `(
    ${p}is_project_done = 0
    AND (LOWER(COALESCE(${p}status,'')) NOT IN ('completed','lost','cancelled'))
    AND (COALESCE(${p}delivery_stage,'') NOT IN ('delivered','closed') OR ${p}delivery_stage IS NULL)
  )`;
}

let _hasStageEntered = null;
let _hasDeliveryEvents = null;
let _hasRevisions = null;
let _hasQuality = null;

async function detectStageEnteredAt() {
  if (_hasStageEntered !== null) return _hasStageEntered;
  try {
    const rows = await queryAsync(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'stage_entered_at'`
    );
    _hasStageEntered = rows.length > 0;
  } catch (_) {
    _hasStageEntered = false;
  }
  return _hasStageEntered;
}

async function detectDeliveryEventsTable() {
  if (_hasDeliveryEvents !== null) return _hasDeliveryEvents;
  try {
    const rows = await queryAsync(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_delivery_events'`
    );
    _hasDeliveryEvents = rows.length > 0;
  } catch (_) {
    _hasDeliveryEvents = false;
  }
  return _hasDeliveryEvents;
}

async function detectRevisionsTable() {
  if (_hasRevisions !== null) return _hasRevisions;
  try {
    const rows = await queryAsync(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_revisions'`
    );
    _hasRevisions = rows.length > 0;
  } catch (_) {
    _hasRevisions = false;
  }
  return _hasRevisions;
}

async function detectQualityTable() {
  if (_hasQuality !== null) return _hasQuality;
  try {
    const rows = await queryAsync(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_delivery_quality'`
    );
    _hasQuality = rows.length > 0;
  } catch (_) {
    _hasQuality = false;
  }
  return _hasQuality;
}

async function recordDeliveryEvent(conn, leadId, eventType, actor, metadata) {
  const has = await detectDeliveryEventsTable();
  if (!has || !eventType) return;
  const run = conn ? conn.queryAsync.bind(conn) : queryAsync;
  const metaJson = metadata ? JSON.stringify(metadata) : null;
  await run(
    `INSERT INTO lead_delivery_events (lead_id, event_type, occurred_at, actor, metadata) VALUES (?,?,NOW(),?,?)`,
    [leadId, eventType, actor || 'ops', metaJson]
  );
}

async function hasEventType(conn, leadId, eventType) {
  const has = await detectDeliveryEventsTable();
  if (!has) return false;
  const run = conn ? conn.queryAsync.bind(conn) : queryAsync;
  const rows = await run(
    `SELECT id FROM lead_delivery_events WHERE lead_id = ? AND event_type = ? LIMIT 1`,
    [leadId, eventType]
  );
  return rows.length > 0;
}

async function nextRevisionNumber(conn, leadId) {
  const run = conn ? conn.queryAsync.bind(conn) : queryAsync;
  const rows = await run(
    `SELECT COALESCE(MAX(revision_number), 0) AS m FROM lead_revisions WHERE lead_id = ?`,
    [leadId]
  );
  return Number(rows[0]?.m || 0) + 1;
}

async function createRevision(conn, leadId, payload, actor) {
  const has = await detectRevisionsTable();
  if (!has) return null;
  const run = conn.queryAsync.bind(conn);
  const num = await nextRevisionNumber(conn, leadId);
  await run(
    `INSERT INTO lead_revisions (lead_id, revision_number, reason, notes, responsible_agent, requested_at, state, created_by)
     VALUES (?,?,?,?,?,NOW(),'requested',?)`,
    [
      leadId,
      num,
      payload.reason || null,
      payload.notes || null,
      payload.responsible_agent || payload.assign || null,
      actor || 'ops',
    ]
  );
  return num;
}

async function completeLatestOpenRevision(conn, leadId) {
  const has = await detectRevisionsTable();
  if (!has) return;
  const run = conn.queryAsync.bind(conn);
  const open = await run(
    `SELECT id FROM lead_revisions WHERE lead_id = ? AND state IN ('requested','in_progress')
     ORDER BY revision_number DESC LIMIT 1`,
    [leadId]
  );
  if (!open.length) return;
  await run(`UPDATE lead_revisions SET state = 'completed', completed_at = NOW() WHERE id = ?`, [open[0].id]);
}

/**
 * Called inside mutateWork transaction after leads row is updated.
 */
async function applyDeliveryLifecycle(conn, ctx) {
  const { leadId, existing, normalized, actor, options } = ctx;
  const fromStage = deriveDeliveryStage(existing);
  const hasStageCol = await detectStageEnteredAt();

  if (Object.prototype.hasOwnProperty.call(normalized, 'is_project_done')) {
    const done = Number(normalized.is_project_done) === 1;
    const wasDone = Number(existing.is_project_done) === 1;
    if (done && !wasDone) {
      await recordDeliveryEvent(conn, leadId, 'work_internally_completed', actor, {
        note: 'Internal completion flag — not client delivery',
      });
    }
  }

  if (!Object.prototype.hasOwnProperty.call(normalized, 'delivery_stage')) return;

  const toStage = String(normalized.delivery_stage).toLowerCase();
  if (fromStage === toStage) return;

  if (hasStageCol) {
    await conn.queryAsync(`UPDATE leads SET stage_entered_at = NOW() WHERE id = ?`, [leadId]);
  }

  const evt = deliveryEventForStage(toStage);
  if (evt === 'work_started') {
    const already = await hasEventType(conn, leadId, 'work_started');
    if (!already) {
      await recordDeliveryEvent(conn, leadId, 'work_started', actor, { stage: toStage });
    }
  } else if (evt) {
    await recordDeliveryEvent(conn, leadId, evt, actor, {
      from: fromStage,
      to: toStage,
      reason: options.reason || null,
    });
  }

  if (toStage === 'revision_required') {
    await createRevision(
      conn,
      leadId,
      {
        reason: options.revisionReason || options.reason || 'Revision requested',
        notes: options.revisionNotes || null,
        responsible_agent: existing.assign,
      },
      actor
    );
  }

  if (fromStage === 'revision_required' && (toStage === 'in_progress' || toStage === 'internal_review')) {
    await completeLatestOpenRevision(conn, leadId, actor);
    await recordDeliveryEvent(conn, leadId, 'revision_completed', actor, { stage: toStage });
  }

  if (toStage === 'closed') {
    await conn.queryAsync(`UPDATE leads SET client_accepted_at = COALESCE(client_accepted_at, NOW()) WHERE id = ?`, [
      leadId,
    ]);
  }
}

function buildSearchClause(q, params) {
  if (!q || !String(q).trim()) return '';
  const like = `%${String(q).trim().replace(/%/g, '\\%')}%`;
  params.push(like, like, like, like);
  return ` AND (enquiry LIKE ? OR name LIKE ? OR number LIKE ? OR assign LIKE ?)`;
}

async function getKanbanBoard(options = {}) {
  const perColumn = Math.min(60, Math.max(5, Number(options.perColumn) || 40));
  const stageFilter = (options.stage || '').trim().toLowerCase();
  const params = [];
  const active = activeWorkSql();
  const search = buildSearchClause(options.q, params);
  let agentSql = '';
  if (options.agent) {
    agentSql = ' AND assign = ?';
    params.push(options.agent);
  }

  const hasStage = await detectStageEnteredAt();
  const stageCol = hasStage ? ', stage_entered_at' : '';
  const cols = `id, enquiry, name, number, deadline, assign, status, priority, delivery_stage, blocker_reason,
    client_dependency, is_project_done, created_at${stageCol}`;

  const stages = stageFilter && DELIVERY_STAGES.includes(stageFilter) ? [stageFilter] : DELIVERY_STAGES;
  const columns = {};

  await Promise.all(
    stages.map(async (stage) => {
      const p = [...params];
      let stageSql;
      if (stage === 'unassigned') {
        stageSql = `(delivery_stage IS NULL OR delivery_stage = 'unassigned')`;
      } else {
        stageSql = `delivery_stage = ?`;
        p.push(stage);
      }
      const [countRow] = await queryAsync(
        `SELECT COUNT(*) AS total FROM leads WHERE ${active} AND ${stageSql}${search}${agentSql}`,
        p
      );
      const total = Number(countRow?.total || 0);
      const rows = await queryAsync(
        `SELECT ${cols} FROM leads WHERE ${active} AND ${stageSql}${search}${agentSql}
         ORDER BY deadline IS NULL, deadline ASC, id DESC LIMIT ?`,
        [...p, perColumn]
      );
      columns[stage] = {
        items: rows.map((r) => enrichLeadRow(r)),
        total,
        truncated: total > rows.length,
      };
    })
  );

  return { columns, perColumn, stageFilter: stageFilter || null };
}

async function getDeliveryRiskSummary(filters = {}) {
  const params = [];
  const search = buildSearchClause(filters.q, params);
  let agentSql = '';
  if (filters.agent) {
    agentSql = ' AND assign = ?';
    params.push(filters.agent);
  }
  const rows = await queryAsync(
    `SELECT id, deadline, delivery_stage, blocker_reason, client_dependency, assign, status, is_project_done, priority
     FROM leads WHERE ${activeWorkSql()} ${search} ${agentSql}`,
    params
  );
  const enriched = rows.map((r) => enrichLeadRow(r));
  return summarizeDeliveryRisk(enriched);
}

async function listDeliveryEvents(leadId, limit = 50) {
  const has = await detectDeliveryEventsTable();
  if (!has) return [];
  return queryAsync(
    `SELECT id, event_type, occurred_at, actor, metadata FROM lead_delivery_events
     WHERE lead_id = ? ORDER BY id DESC LIMIT ?`,
    [leadId, limit]
  );
}

async function listRevisions(leadId) {
  const has = await detectRevisionsTable();
  if (!has) return [];
  return queryAsync(
    `SELECT id, revision_number, reason, notes, responsible_agent, requested_at, completed_at, state, created_by, created_at
     FROM lead_revisions WHERE lead_id = ? ORDER BY revision_number ASC`,
    [leadId]
  );
}

async function addRevision(leadId, payload, actor) {
  const has = await detectRevisionsTable();
  if (!has) return { success: false, message: 'Revisions table not migrated' };
  const conn = await new Promise((resolve, reject) => {
    pool.getConnection((err, c) => {
      if (err) reject(err);
      else {
        c.queryAsync = util.promisify(c.query).bind(c);
        resolve(c);
      }
    });
  });
  try {
    await conn.queryAsync('START TRANSACTION');
    const num = await createRevision(conn, leadId, payload, actor);
    await recordDeliveryEvent(conn, leadId, 'revision_requested', actor, { revision_number: num, manual: true });
    await conn.queryAsync('COMMIT');
    return { success: true, revision_number: num };
  } catch (e) {
    await conn.queryAsync('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

async function getDeliveryQuality(leadId) {
  const has = await detectQualityTable();
  if (!has) return null;
  const rows = await queryAsync(`SELECT * FROM lead_delivery_quality WHERE lead_id = ? LIMIT 1`, [leadId]);
  return rows[0] || null;
}

async function upsertDeliveryQuality(leadId, patch, actor) {
  const has = await detectQualityTable();
  if (!has) return { success: false, message: 'Quality table not migrated' };
  const allowed = [
    'internal_review_confirmed',
    'deliverables_checklist',
    'delivery_ready_confirmed',
    'delivery_method',
    'delivery_reference',
    'client_acceptance_notes',
  ];
  const updates = {};
  allowed.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(patch, k)) updates[k] = patch[k];
  });
  if (!Object.keys(updates).length) return { success: false, message: 'No quality fields' };

  const nowFields = {};
  if (updates.internal_review_confirmed === 1 || updates.internal_review_confirmed === true) {
    nowFields.internal_review_at = new Date();
  }
  if (updates.delivery_ready_confirmed === 1 || updates.delivery_ready_confirmed === true) {
    nowFields.delivery_ready_at = new Date();
  }

  const existing = await getDeliveryQuality(leadId);
  if (!existing) {
    const keys = ['lead_id', ...Object.keys(updates), ...Object.keys(nowFields)];
    const vals = [leadId, ...Object.values(updates), ...Object.values(nowFields)];
    const ph = keys.map(() => '?').join(',');
    await queryAsync(`INSERT INTO lead_delivery_quality (${keys.join(',')}) VALUES (${ph})`, vals);
  } else {
    const all = { ...updates, ...nowFields };
    const setParts = [];
    const params = [];
    Object.entries(all).forEach(([k, v]) => {
      setParts.push('?? = ?');
      params.push(k, k === 'deliverables_checklist' && v && typeof v === 'object' ? JSON.stringify(v) : v);
    });
    params.push(leadId);
    await queryAsync(`UPDATE lead_delivery_quality SET ${setParts.join(', ')} WHERE lead_id = ?`, params);
  }

  await recordDeliveryEvent(null, leadId, 'quality_updated', actor, { fields: Object.keys(updates) });
  return { success: true, quality: await getDeliveryQuality(leadId) };
}

module.exports = {
  detectStageEnteredAt,
  detectDeliveryEventsTable,
  detectRevisionsTable,
  detectQualityTable,
  applyDeliveryLifecycle,
  recordDeliveryEvent,
  getKanbanBoard,
  getDeliveryRiskSummary,
  listDeliveryEvents,
  listRevisions,
  addRevision,
  getDeliveryQuality,
  upsertDeliveryQuality,
};
