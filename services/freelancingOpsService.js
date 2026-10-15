'use strict';

const util = require('util');
const pool = require('../routes/pool');
const {
  deriveDeliveryStage,
  isActiveWork,
  urgencyBucket,
  canTransitionStage,
  enrichLeadRow,
  legacyStatusForStage,
  isLegacyExecutionStatus,
  DELIVERY_STAGES,
} = require('../utils/freelancingOpsMap');
const { todayYmdInTz, DEFAULT_TZ } = require('../utils/freelancingOpsDates');
const deliveryOps = require('./freelancingDeliveryService');
const clientOps = require('./freelancingClientOpsService');
const {
  enrichClientDependencyFields,
  normalizeDependencyType,
  canTransitionDependencyStatus,
} = require('../utils/freelancingClientDeps');

const queryAsync = util.promisify(pool.query).bind(pool);

const WORK_LIST_COLUMNS = `
  id, enquiry, name, number, deadline, remarks, assign, status,
  lead_price, agent_price, advance_amount, pakistani_price,
  is_project_done, is_payment_received, is_agent_payment_done,
  created_at, priority, delivery_stage, client_dependency, client_dependency_note,
  blocker_reason, follow_up_due, next_action_date
`;

let _hasOpsColumns = null;
let _hasOpsVersion = null;
let _activityLogHasReason = null;

async function detectOpsColumns() {
  if (_hasOpsColumns !== null) return _hasOpsColumns;
  try {
    const rows = await queryAsync(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'delivery_stage'`
    );
    _hasOpsColumns = rows.length > 0;
  } catch (_) {
    _hasOpsColumns = false;
  }
  return _hasOpsColumns;
}

async function detectOpsVersion() {
  if (_hasOpsVersion !== null) return _hasOpsVersion;
  try {
    const rows = await queryAsync(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'ops_version'`
    );
    _hasOpsVersion = rows.length > 0;
  } catch (_) {
    _hasOpsVersion = false;
  }
  return _hasOpsVersion;
}

async function detectActivityLogReason() {
  if (_activityLogHasReason !== null) return _activityLogHasReason;
  try {
    const rows = await queryAsync(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_activity_log' AND COLUMN_NAME = 'reason'`
    );
    _activityLogHasReason = rows.length > 0;
  } catch (_) {
    _activityLogHasReason = false;
  }
  return _activityLogHasReason;
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

function coerceFieldValue(field, value) {
  if (value === undefined) return value;
  if (['is_project_done', 'is_payment_received', 'is_agent_payment_done'].includes(field)) {
    if (value === true || value === 'true' || value === 1 || value === '1') return 1;
    if (value === false || value === 'false' || value === 0 || value === '0') return 0;
  }
  if (value === '') return null;
  return value;
}

function activeWorkSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `(
    ${p}is_project_done = 0
    AND (LOWER(COALESCE(${p}status,'')) NOT IN ('completed','lost','cancelled'))
    AND (COALESCE(${p}delivery_stage,'') NOT IN ('delivered','closed') OR ${p}delivery_stage IS NULL)
  )`;
}

function buildSearchClause(q, params) {
  if (!q || !String(q).trim()) return '';
  const like = `%${String(q).trim().replace(/%/g, '\\%')}%`;
  params.push(like, like, like, like);
  return ` AND (enquiry LIKE ? OR name LIKE ? OR number LIKE ? OR assign LIKE ?)`;
}

async function getExecutiveKpis(filters = {}) {
  const hasOps = await detectOpsColumns();
  const params = [];
  let search = buildSearchClause(filters.q, params);
  let agent = '';
  if (filters.agent) {
    agent = ' AND assign = ?';
    params.push(filters.agent);
  }

  const active = activeWorkSql();
  const critCol = hasOps ? `COUNT(CASE WHEN ${active} AND priority = 'critical' THEN 1 END)` : '0';

  const sql = `
    SELECT
      COUNT(CASE WHEN ${active} THEN 1 END) AS active_work,
      COUNT(CASE WHEN ${active} AND deadline IS NOT NULL AND deadline < CURDATE() THEN 1 END) AS overdue,
      COUNT(CASE WHEN ${active} AND deadline = CURDATE() THEN 1 END) AS due_today,
      COUNT(CASE WHEN ${active} AND deadline BETWEEN CURDATE() + INTERVAL 1 DAY AND CURDATE() + INTERVAL 2 DAY THEN 1 END) AS due_48h,
      ${critCol} AS critical_priority,
      COUNT(CASE WHEN ${hasOps ? `${active} AND client_dependency <> 'none'` : `${active} AND status = 'client_review'`} THEN 1 END) AS awaiting_client,
      COUNT(CASE WHEN ${active} AND (assign IS NULL OR TRIM(assign) = '') THEN 1 END) AS unassigned_active,
      COUNT(CASE WHEN is_project_done = 1 AND is_payment_received = 0 THEN 1 END) AS payment_pending
    FROM leads
    WHERE 1=1 ${search} ${agent}
  `;
  const [row] = await queryAsync(sql, params);
  return {
    active_work: Number(row?.active_work || 0),
    overdue: Number(row?.overdue || 0),
    due_today: Number(row?.due_today || 0),
    due_48h: Number(row?.due_48h || 0),
    critical_priority: Number(row?.critical_priority || 0),
    awaiting_client: Number(row?.awaiting_client || 0),
    unassigned_active: Number(row?.unassigned_active || 0),
    payment_pending: Number(row?.payment_pending || 0),
  };
}

async function getNavBadgeCounts() {
  const hasOps = await detectOpsColumns();
  const active = activeWorkSql();
  const sql = `
    SELECT
      COUNT(CASE WHEN ${active} AND deadline IS NOT NULL AND deadline < CURDATE() THEN 1 END) AS overdue,
      COUNT(CASE WHEN ${hasOps ? `client_dependency <> 'none'` : `status = 'client_review'`} THEN 1 END) AS client_pending,
      COUNT(CASE WHEN ${active} AND (assign IS NULL OR TRIM(assign) = '') THEN 1 END) AS unassigned
    FROM leads
  `;
  const [row] = await queryAsync(sql);
  let follow_up_overdue = 0;
  try {
    const kpis = await clientOps.getClientDependencyKpis();
    follow_up_overdue = kpis.overdue_follow_ups;
  } catch (_) {}

  return {
    overdue: Number(row?.overdue || 0),
    client_pending: Number(row?.client_pending || 0),
    unassigned: Number(row?.unassigned || 0),
    follow_up_overdue,
  };
}

async function getPipelineCounts() {
  const hasOps = await detectOpsColumns();
  const active = activeWorkSql();
  if (!hasOps) {
    const [legacy] = await queryAsync(`
      SELECT
        COUNT(CASE WHEN ${active} AND (assign IS NULL OR TRIM(assign)='') THEN 1 END) AS unassigned,
        COUNT(CASE WHEN ${active} AND status='assign' THEN 1 END) AS assigned,
        COUNT(CASE WHEN ${active} AND status='in_progress' THEN 1 END) AS in_progress,
        COUNT(CASE WHEN ${active} AND status='client_review' THEN 1 END) AS client_review,
        COUNT(CASE WHEN ${active} AND status='in_changes' THEN 1 END) AS revision_required,
        COUNT(CASE WHEN is_project_done=1 THEN 1 END) AS ready_for_delivery
      FROM leads
    `);
    return {
      unassigned: Number(legacy?.unassigned || 0),
      assigned: Number(legacy?.assigned || 0),
      in_progress: Number(legacy?.in_progress || 0),
      internal_review: 0,
      client_review: Number(legacy?.client_review || 0),
      revision_required: Number(legacy?.revision_required || 0),
      ready_for_delivery: Number(legacy?.ready_for_delivery || 0),
      delivered: 0,
      closed: 0,
    };
  }

  const counts = {};
  DELIVERY_STAGES.forEach((s) => {
    counts[s] = 0;
  });
  const rows = await queryAsync(
    `SELECT delivery_stage, COUNT(*) AS c FROM leads WHERE ${active} GROUP BY delivery_stage`
  );
  rows.forEach((r) => {
    const k = r.delivery_stage || 'unassigned';
    if (counts[k] !== undefined) counts[k] = Number(r.c);
    else counts.unassigned += Number(r.c);
  });
  const nullRows = await queryAsync(
    `SELECT COUNT(*) AS c FROM leads WHERE ${active} AND delivery_stage IS NULL`
  );
  counts.unassigned += Number(nullRows[0]?.c || 0);
  return counts;
}

function applyQueueViewFilter(view, where, hasOps) {
  if (!view || view === 'all' || view === 'active') return;

  if (view === 'critical' && hasOps) where.push(`priority = 'critical'`);
  else if (view === 'high' && hasOps) where.push(`priority = 'high'`);
  else if (view === 'overdue') where.push(`deadline IS NOT NULL AND deadline < CURDATE()`);
  else if (view === 'today') where.push(`deadline = CURDATE()`);
  else if (view === 'next48') {
    where.push(`deadline IS NOT NULL AND deadline >= CURDATE() AND deadline <= DATE_ADD(CURDATE(), INTERVAL 2 DAY)`);
  } else if (view === 'blocked' && hasOps) {
    where.push(`(blocker_reason IS NOT NULL AND TRIM(blocker_reason) <> '')`);
  } else if (view === 'missing_deadline' || view === 'unscheduled') {
    where.push(`deadline IS NULL`);
  } else if (view === 'client_pending') {
    if (hasOps) where.push(`client_dependency <> 'none'`);
    else where.push(`status = 'client_review'`);
  } else if (view === 'unassigned') {
    where.push(`(assign IS NULL OR TRIM(assign) = '')`);
  } else if (view === 'critical_unassigned' && hasOps) {
    where.push(`priority = 'critical' AND (assign IS NULL OR TRIM(assign) = '')`);
  } else if (view === 'high_no_deadline' && hasOps) {
    where.push(`priority = 'high' AND deadline IS NULL`);
  } else if (view === 'overdue_client' && hasOps) {
    where.push(
      `deadline IS NOT NULL AND deadline < CURDATE() AND client_dependency IS NOT NULL AND client_dependency <> 'none'`
    );
  } else if (view === 'due_today_not_started') {
    where.push(`deadline = CURDATE()`);
    if (hasOps) {
      where.push(
        `(delivery_stage IN ('unassigned','assigned') OR (delivery_stage IS NULL AND LOWER(COALESCE(status,'')) IN ('pending','assign')))`
      );
    } else {
      where.push(`LOWER(COALESCE(status,'')) IN ('pending','assign')`);
    }
  } else if (view === 'delivered_pending_closure' && hasOps) {
    where.push(`delivery_stage = 'delivered'`);
  } else if (view === 'unassigned_urgent' && hasOps) {
    where.push(`(assign IS NULL OR TRIM(assign) = '')`);
    where.push(
      `(priority IN ('critical','high') OR (deadline IS NOT NULL AND deadline <= CURDATE()))`
    );
  }
}

function buildListWorkOrder(sort, hasOps) {
  switch (sort) {
    case 'priority':
      return hasOps
        ? `FIELD(priority,'critical','high','medium','low'), deadline IS NULL, deadline ASC, id DESC`
        : 'deadline IS NULL, deadline ASC, id DESC';
    case 'stage':
      return hasOps
        ? `FIELD(COALESCE(delivery_stage,'unassigned'),'unassigned','assigned','in_progress','internal_review','client_review','revision_required','ready_for_delivery','delivered','closed'), deadline ASC`
        : 'status ASC, deadline ASC';
    case 'project':
      return 'enquiry ASC, id DESC';
    case 'client':
      return 'name ASC, id DESC';
    case 'assign':
      return 'assign IS NULL, assign ASC, deadline ASC';
    case 'updated':
      return 'last_activity_at DESC, id DESC';
    case 'deadline_desc':
      return 'deadline IS NULL, deadline DESC, id DESC';
    default:
      return 'deadline IS NULL, deadline ASC, id DESC';
  }
}

async function listWork(options = {}) {
  const hasOps = await detectOpsColumns();
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(options.limit) || 50));
  const offset = (page - 1) * limit;
  const params = [];
  const where = ['1=1'];

  const skipActive =
    options.view === 'delivered_pending_closure' || options.activeOnly === false;
  if (!skipActive) {
    where.push(activeWorkSql());
  }

  applyQueueViewFilter(options.view, where, hasOps);

  if (options.view === 'mine' && options.myAssign) {
    where.push('assign = ?');
    params.push(options.myAssign);
  }

  if (options.delivery_stage && hasOps) {
    where.push(`(delivery_stage = ? OR (delivery_stage IS NULL AND ? = 'unassigned'))`);
    params.push(options.delivery_stage, options.delivery_stage);
  }
  if (options.agent) {
    where.push('assign = ?');
    params.push(options.agent);
  }
  if (options.priority && hasOps) {
    where.push('priority = ?');
    params.push(options.priority);
  }

  const searchSql = buildSearchClause(options.q, params);
  const whereSql = where.join(' AND ') + searchSql;

  const [countRow] = await queryAsync(`SELECT COUNT(*) AS total FROM leads WHERE ${whereSql}`, params);
  const total = Number(countRow?.total || 0);

  const order = buildListWorkOrder(options.sort, hasOps);
  let cols = hasOps
    ? WORK_LIST_COLUMNS
    : `id, enquiry, name, number, deadline, remarks, assign, status,
       lead_price, agent_price, advance_amount, pakistani_price,
       is_project_done, is_payment_received, is_agent_payment_done, created_at`;

  const hasActivityTable = await queryAsync(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_activity_log'`
  ).catch(() => []);
  if (hasActivityTable.length) {
    cols += `, (SELECT MAX(lal.created_at) FROM lead_activity_log lal WHERE lal.lead_id = leads.id) AS last_activity_at`;
  } else {
    cols += `, created_at AS last_activity_at`;
  }

  const rows = await queryAsync(
    `SELECT ${cols} FROM leads WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const items = rows.map((r) => enrichLeadRow(r));
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
}

async function getPriorityQueueCounts() {
  const hasOps = await detectOpsColumns();
  const active = activeWorkSql();
  const priCol = hasOps ? '`priority`' : null;
  const crit = hasOps
    ? `COUNT(CASE WHEN ${active} AND ${priCol}='critical' THEN 1 END)`
    : '0';
  const high = hasOps ? `COUNT(CASE WHEN ${active} AND ${priCol}='high' THEN 1 END)` : '0';
  const blocked = hasOps
    ? `COUNT(CASE WHEN ${active} AND blocker_reason IS NOT NULL AND TRIM(blocker_reason)<>'' THEN 1 END)`
    : '0';
  const sql = `
    SELECT
      COUNT(CASE WHEN ${active} THEN 1 END) AS active_all,
      ${crit} AS critical,
      ${high} AS high_pri_cnt,
      COUNT(CASE WHEN ${active} AND deadline IS NOT NULL AND deadline < CURDATE() THEN 1 END) AS overdue,
      COUNT(CASE WHEN ${active} AND deadline = CURDATE() THEN 1 END) AS due_today,
      COUNT(CASE WHEN ${active} AND deadline IS NOT NULL AND deadline >= CURDATE() AND deadline <= DATE_ADD(CURDATE(), INTERVAL 2 DAY) THEN 1 END) AS next_48h,
      ${blocked} AS blocked,
      COUNT(CASE WHEN ${active} AND deadline IS NULL THEN 1 END) AS missing_deadline
    FROM leads
  `;
  const [row] = await queryAsync(sql);
  return {
    active_all: Number(row?.active_all || 0),
    critical: Number(row?.critical || 0),
    high_priority: Number(row?.high_pri_cnt || 0),
    overdue: Number(row?.overdue || 0),
    due_today: Number(row?.due_today || 0),
    next_48h: Number(row?.next_48h || 0),
    blocked: Number(row?.blocked || 0),
    missing_deadline: Number(row?.missing_deadline || 0),
  };
}

const NEEDS_ATTENTION_RULES = [
  {
    id: 'critical_unassigned',
    label: 'Critical · Unassigned',
    actionLabel: 'Open queue',
    actionHref: '/freelancing/priority?view=critical_unassigned',
    bulkHint: 'assign',
  },
  {
    id: 'high_no_deadline',
    label: 'High priority · Missing deadline',
    actionLabel: 'Set deadlines',
    actionHref: '/freelancing/priority?view=high_no_deadline',
    bulkHint: 'deadline',
  },
  {
    id: 'overdue_client',
    label: 'Overdue · Waiting for client',
    actionLabel: 'Client pending',
    actionHref: '/freelancing/priority?view=overdue_client',
    bulkHint: 'follow_up',
  },
  {
    id: 'due_today_not_started',
    label: 'Due today · Not started',
    actionLabel: 'Start work',
    actionHref: '/freelancing/priority?view=due_today_not_started',
    bulkHint: 'stage',
  },
  {
    id: 'delivered_pending_closure',
    label: 'Delivered · Pending closure',
    actionLabel: 'Close out',
    actionHref: '/freelancing/priority?view=delivered_pending_closure',
    bulkHint: 'stage',
  },
  {
    id: 'unassigned_urgent',
    label: 'Unassigned · Urgent',
    actionLabel: 'Assign',
    actionHref: '/freelancing/priority?view=unassigned_urgent',
    bulkHint: 'assign',
  },
];

async function getNeedsAttention(perRule = 6) {
  const groups = [];
  for (const rule of NEEDS_ATTENTION_RULES) {
    const { items, total } = await listWork({
      view: rule.id,
      limit: perRule,
      page: 1,
      activeOnly: rule.id === 'delivered_pending_closure' ? false : true,
    });
    if (total > 0) {
      groups.push({
        ...rule,
        total,
        items,
      });
    }
  }
  return groups;
}

async function resolveMyAssignName(sessionAffiliation) {
  if (!sessionAffiliation) return null;
  try {
    const rows = await queryAsync('SELECT name, email FROM freelancing WHERE id = ? LIMIT 1', [
      sessionAffiliation,
    ]);
    if (!rows.length) return null;
    const name = (rows[0].name || '').toString().trim();
    if (name) return name;
    const email = (rows[0].email || '').toString().trim();
    if (email.includes('@')) return email.split('@')[0];
    return email || null;
  } catch (_) {
    return null;
  }
}

const BULK_MUTATION_FIELDS = [
  'assign',
  'priority',
  'deadline',
  'delivery_stage',
  'blocker_reason',
  'client_dependency',
  'follow_up_due',
  'remarks',
  'estimated_effort_points',
];

async function bulkMutateWork(ids, patch, actor = 'ops', options = {}) {
  const idList = [...new Set((ids || []).map((x) => Number(x)).filter((n) => n > 0))].slice(0, 100);
  if (!idList.length) return { success: false, message: 'No valid work IDs' };

  const body = { ...(patch || {}) };
  const mergedOpts = {
    expectedVersion: options.expectedVersion ?? body.expectedVersion,
    reason: options.reason ?? body.reason,
    forceTransition: options.forceTransition ?? body.forceTransition,
  };
  delete body.expectedVersion;
  delete body.reason;
  delete body.forceTransition;

  const keys = Object.keys(body).filter((k) => BULK_MUTATION_FIELDS.includes(k));
  if (!keys.length) {
    return { success: false, message: 'No allowed bulk fields in patch' };
  }
  const smallPatch = {};
  keys.forEach((k) => {
    smallPatch[k] = body[k];
  });

  const results = [];
  for (const id of idList) {
    try {
      const r = await mutateWork(id, smallPatch, actor, mergedOpts);
      results.push({
        id,
        success: !!r.success,
        message: r.message,
        code: r.code,
      });
    } catch (e) {
      results.push({ id, success: false, message: e.message || 'Error' });
    }
  }
  const succeeded = results.filter((r) => r.success).length;
  return {
    success: succeeded > 0,
    succeeded,
    failed: results.length - succeeded,
    total: results.length,
    results,
  };
}

async function getPriorityAttention(limit = 10) {
  const groups = await getNeedsAttention(Math.ceil(limit / 2) + 2);
  const flat = [];
  groups.forEach((g) => {
    g.items.forEach((it) => flat.push({ ...it, attention_rule: g.id, attention_label: g.label }));
  });
  return flat.slice(0, limit);
}

const ATTENTION_RULE_MAP = Object.fromEntries(NEEDS_ATTENTION_RULES.map((r) => [r.id, r]));

async function getExecutiveAttentionQueue(limit = 12) {
  const rows = await getPriorityAttention(limit);
  return rows.map((row) => {
    const rule = ATTENTION_RULE_MAP[row.attention_rule] || {};
    return {
      id: row.id,
      priority: row.priority_effective || row.priority || 'medium',
      project: row.enquiry || `Work #${row.id}`,
      client: row.name || null,
      issue: row.attention_label || rule.label || 'Needs review',
      owner: row.assign && String(row.assign).trim() ? row.assign : 'Unassigned',
      deadline: row.deadline ? String(row.deadline).slice(0, 10) : null,
      recommended_action: rule.actionLabel || 'Open work',
      action_href: rule.actionHref || '/freelancing/priority?view=attention',
      urgency: row.urgency || null,
      delivery_stage: row.delivery_stage_effective || row.delivery_stage || null,
    };
  });
}

async function getTeamWorkload(filters = {}) {
  const workload = require('./freelancingWorkloadService');
  const dash = await workload.getTeamWorkloadDashboard(filters);
  const rows = dash.agents.map((a) => ({
    agent_name: a.agent_name,
    active_tasks: a.active_tasks,
    overdue_tasks: a.overdue_tasks,
    due_today: a.due_today,
    in_progress: a.in_progress,
    client_review: a.waiting_for_client,
    critical_tasks: a.critical_tasks,
    blocked_tasks: a.blocked_tasks,
    load_status: a.load_status,
    load_status_label: a.load_status_label,
    utilization_pct: a.utilization_pct,
  }));
  if (dash.unassigned_bucket) {
    rows.push({
      agent_name: dash.unassigned_bucket.agent_name,
      active_tasks: dash.unassigned_bucket.active_tasks,
      overdue_tasks: dash.unassigned_bucket.overdue_tasks,
      due_today: dash.unassigned_bucket.due_today,
      in_progress: dash.unassigned_bucket.in_progress,
      client_review: dash.unassigned_bucket.waiting_for_client,
      critical_tasks: dash.unassigned_bucket.critical_tasks,
      blocked_tasks: dash.unassigned_bucket.blocked_tasks,
    });
  }
  return rows;
}

async function getFinanceSummary(from, to) {
  const params = [from, to, from, to, from, to, from, to];
  const [row] = await queryAsync(
    `
    SELECT
      COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? THEN lead_price ELSE 0 END), 0) AS billed,
      COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? THEN advance_amount ELSE 0 END), 0) AS received,
      COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? THEN (lead_price - advance_amount) ELSE 0 END), 0) AS client_outstanding_range,
      COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? THEN agent_price ELSE 0 END), 0) AS agent_cost
    FROM leads WHERE 1=1
  `,
    params
  );

  const [snap] = await queryAsync(`
    SELECT
      COALESCE(SUM(CASE WHEN is_project_done=1 AND is_payment_received=0 THEN GREATEST(lead_price - advance_amount, 0) ELSE 0 END), 0) AS client_outstanding,
      COALESCE(SUM(CASE WHEN is_payment_received=1 AND is_agent_payment_done=0 THEN GREATEST(agent_price, 0) ELSE 0 END), 0) AS agent_payable
    FROM leads
  `);

  const billed = Number(row?.billed || 0);
  const agentCost = Number(row?.agent_cost || 0);
  return {
    billed,
    received: Number(row?.received || 0),
    client_outstanding: Number(snap?.client_outstanding || 0),
    agent_cost: agentCost,
    agent_payable: Number(snap?.agent_payable || 0),
    gross_profit: billed - agentCost,
    range_client_outstanding: Number(row?.client_outstanding_range || 0),
  };
}

async function getWorkById(id) {
  const hasOps = await detectOpsColumns();
  const hasVersion = await detectOpsVersion();
  let cols = hasOps
    ? `${WORK_LIST_COLUMNS}, internal_completed_at, client_submitted_at, delivered_at, client_accepted_at, blocker_resolved_at`
    : `id, enquiry, name, number, deadline, remarks, assign, status,
       lead_price, agent_price, advance_amount, pakistani_price,
       is_project_done, is_payment_received, is_agent_payment_done, created_at`;
  if (hasOps && (await deliveryOps.detectStageEnteredAt())) cols += ', stage_entered_at';
  if (hasVersion) cols += ', ops_version';
  try {
    const effortCol = await queryAsync(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'estimated_effort_points'`
    );
    if (effortCol.length) cols += ', estimated_effort_points';
  } catch (_) {}

  const rows = await queryAsync(`SELECT ${cols} FROM leads WHERE id = ? LIMIT 1`, [id]);
  if (!rows.length) return null;
  const row = enrichLeadRow(rows[0]);
  if (hasVersion && row.ops_version == null) row.ops_version = 0;
  return { ...row, ...enrichClientDependencyFields(row) };
}

async function logActivity(leadId, eventType, fieldName, oldVal, newVal, actor, reason, conn) {
  const run = conn ? conn.queryAsync.bind(conn) : queryAsync;
  const hasTable = await run(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_activity_log'`
  ).catch(() => []);
  if (!hasTable.length) return;
  const hasReason = await detectActivityLogReason();
  const oldS = oldVal == null ? null : String(oldVal);
  const newS = newVal == null ? null : String(newVal);
  if (hasReason) {
    await run(
      `INSERT INTO lead_activity_log (lead_id, event_type, field_name, old_value, new_value, actor, reason) VALUES (?,?,?,?,?,?,?)`,
      [leadId, eventType || 'field_change', fieldName, oldS, newS, actor || 'ops', reason || null]
    );
  } else {
    await run(
      `INSERT INTO lead_activity_log (lead_id, event_type, field_name, old_value, new_value, actor) VALUES (?,?,?,?,?,?)`,
      [leadId, eventType || 'field_change', fieldName, oldS, newS, actor || 'ops']
    );
  }
}

const LEGACY_ALLOWED = [
  'name', 'number', 'enquiry', 'deadline', 'assign', 'lead_price', 'agent_price',
  'advance_amount', 'remarks', 'is_project_done', 'is_payment_received', 'is_agent_payment_done',
  'status', 'pakistani_price',
];

const OPS_ALLOWED = [
  'priority', 'delivery_stage', 'client_dependency', 'client_dependency_note',
  'blocker_reason', 'follow_up_due', 'next_action_date',
  'client_dependency_status', 'follow_up_owner', 'estimated_effort_points',
];

function eventTypeForField(field, forced) {
  if (field === 'delivery_stage') return forced ? 'forced_stage_transition' : 'stage_transition';
  if (field === 'assign') return 'assignment_change';
  if (field === 'priority') return 'priority_change';
  if (field === 'deadline') return 'deadline_change';
  return 'field_change';
}

function applyCompanionUpdates(existing, changes, hasOps) {
  const extra = {};
  if (!hasOps) return extra;

  if (Object.prototype.hasOwnProperty.call(changes, 'delivery_stage')) {
    const to = String(changes.delivery_stage).toLowerCase();
    const mapped = legacyStatusForStage(to);
    if (mapped && isLegacyExecutionStatus(existing.status)) {
      extra.status = mapped;
    }
    if (to === 'delivered') extra.delivered_at = existing.delivered_at || new Date();
    if (to === 'client_review' && !existing.client_submitted_at) {
      extra.client_submitted_at = new Date();
    }
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'is_project_done')) {
    const done = Number(changes.is_project_done) === 1;
    if (done && !existing.internal_completed_at) extra.internal_completed_at = new Date();
    if (!done) extra.internal_completed_at = null;
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'blocker_reason')) {
    const next = (changes.blocker_reason || '').toString().trim();
    const prev = (existing.blocker_reason || '').toString().trim();
    if (prev && !next) extra.blocker_resolved_at = new Date();
    if (next && !prev) extra.blocker_resolved_at = null;
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'client_dependency')) {
    const to = normalizeDependencyType(changes.client_dependency);
    const from = normalizeDependencyType(existing.client_dependency);
    if (to !== 'none' && from === 'none') {
      extra.client_dependency_opened_at = new Date();
      extra.client_dependency_status = changes.follow_up_due ? 'follow_up_scheduled' : 'open';
      extra.client_dependency_resolved_at = null;
    }
    if (to === 'none' && from !== 'none') {
      extra.client_dependency_status = 'resolved';
      extra.client_dependency_resolved_at = new Date();
    }
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'follow_up_due') && changes.follow_up_due) {
    if ((existing.client_dependency_status || 'open') !== 'resolved') {
      extra.client_dependency_status = 'follow_up_scheduled';
    }
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'client_dependency_status')) {
    const to = String(changes.client_dependency_status).toLowerCase();
    if (to === 'resolved') {
      extra.client_dependency = 'none';
      extra.client_dependency_resolved_at = new Date();
      extra.follow_up_due = null;
    }
  }

  return extra;
}

async function mutateWork(id, changes, actor = 'ops', options = {}) {
  const hasOps = await detectOpsColumns();
  const hasVersion = await detectOpsVersion();
  const allowed = [...LEGACY_ALLOWED];
  if (hasOps) allowed.push(...OPS_ALLOWED);

  const keys = Object.keys(changes || {});
  if (!keys.length) return { success: true, work: await getWorkById(id) };

  for (const field of keys) {
    if (!allowed.includes(field)) {
      return { success: false, message: `Invalid field: ${field}` };
    }
  }

  const conn = await getConnectionAsync();
  try {
    await conn.queryAsync('START TRANSACTION');

    let selectCols = 'id, enquiry, name, number, deadline, remarks, assign, status, lead_price, agent_price, advance_amount, pakistani_price, is_project_done, is_payment_received, is_agent_payment_done, created_at';
    if (hasOps) {
      selectCols += ', priority, delivery_stage, client_dependency, client_dependency_note, blocker_reason, follow_up_due, next_action_date, internal_completed_at, client_submitted_at, delivered_at, client_accepted_at, blocker_resolved_at';
    }
    if (await deliveryOps.detectStageEnteredAt()) {
      selectCols += ', stage_entered_at';
    }
    if (hasVersion) selectCols += ', ops_version';

    const rows = await conn.queryAsync(`SELECT ${selectCols} FROM leads WHERE id = ? FOR UPDATE`, [id]);
    if (!rows.length) {
      await conn.queryAsync('ROLLBACK');
      return { success: false, message: 'Not found' };
    }

    const existing = enrichLeadRow(rows[0]);
    const currentVersion = hasVersion ? Number(existing.ops_version || 0) : 0;

    if (hasVersion && options.expectedVersion != null && options.expectedVersion !== '') {
      const expected = Number(options.expectedVersion);
      if (expected !== currentVersion) {
        await conn.queryAsync('ROLLBACK');
        return {
          success: false,
          code: 'CONFLICT',
          message: 'This work was updated by someone else. Refresh and try again.',
          ops_version: currentVersion,
          work: existing,
        };
      }
    }

    const normalized = {};
    for (const field of keys) {
      normalized[field] = coerceFieldValue(field, changes[field]);
    }

    if (hasOps && Object.prototype.hasOwnProperty.call(normalized, 'client_dependency_status')) {
      const from = (existing.client_dependency_status || 'open').toLowerCase();
      const to = String(normalized.client_dependency_status).toLowerCase();
      if (from !== to && !canTransitionDependencyStatus(from, to)) {
        await conn.queryAsync('ROLLBACK');
        return { success: false, message: `Dependency status ${from} → ${to} not allowed` };
      }
    }

    let forcedStage = false;
    if (hasOps && Object.prototype.hasOwnProperty.call(normalized, 'delivery_stage')) {
      const from = deriveDeliveryStage(existing);
      const to = String(normalized.delivery_stage).toLowerCase();
      normalized.delivery_stage = to;
      if (from !== to && !canTransitionStage(from, to, { force: options.forceTransition })) {
        await conn.queryAsync('ROLLBACK');
        return { success: false, message: `Transition ${from} → ${to} not allowed` };
      }
      if (from !== to && options.forceTransition) {
        if (!(options.reason || '').toString().trim()) {
          await conn.queryAsync('ROLLBACK');
          return { success: false, message: 'Reason is required for a forced stage transition' };
        }
        forcedStage = true;
      }
    }

    const companions = applyCompanionUpdates(existing, normalized, hasOps);
    const hasClientLc = await clientOps.detectClientLifecycleColumns();
    if (!hasClientLc) {
      delete companions.client_dependency_opened_at;
      delete companions.client_dependency_status;
      delete companions.client_dependency_resolved_at;
    }
    const allUpdates = { ...normalized, ...companions };

    let changed = false;
    for (const [field, value] of Object.entries(allUpdates)) {
      if (String(existing[field] ?? '') !== String(value ?? '')) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      await conn.queryAsync('ROLLBACK');
      return { success: true, work: existing, ops_version: currentVersion };
    }

    const setParts = [];
    const params = [];
    for (const [field, value] of Object.entries(allUpdates)) {
      setParts.push('?? = ?');
      params.push(field, value);
    }
    if (hasVersion) {
      setParts.push('ops_version = ops_version + 1');
    }
    params.push(id);

    await conn.queryAsync(`UPDATE leads SET ${setParts.join(', ')} WHERE id = ?`, params);

    await deliveryOps.applyDeliveryLifecycle(conn, {
      leadId: id,
      existing,
      normalized,
      actor,
      options,
    });

    const reason = (options.reason || '').toString().trim() || null;
    for (const field of keys) {
      const oldVal = existing[field];
      const newVal = normalized[field];
      if (String(oldVal ?? '') === String(newVal ?? '')) continue;
      const evt = eventTypeForField(field, forcedStage && field === 'delivery_stage');
      await logActivity(id, evt, field, oldVal, newVal, actor, reason, conn);
    }
    for (const [field, value] of Object.entries(companions)) {
      if (keys.includes(field)) continue;
      const oldVal = existing[field];
      if (String(oldVal ?? '') === String(value ?? '')) continue;
      await logActivity(id, 'companion_update', field, oldVal, value, actor, reason, conn);
    }

    await conn.queryAsync('COMMIT');
    return { success: true, work: await getWorkById(id), ops_version: hasVersion ? currentVersion + 1 : undefined };
  } catch (e) {
    await conn.queryAsync('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

async function updateWorkField(id, field, value, actor = 'ops', options = {}) {
  return mutateWork(id, { [field]: value }, actor, options);
}

async function patchWork(id, patch, actor = 'ops', options = {}) {
  const body = { ...(patch || {}) };
  const merged = {
    expectedVersion: options.expectedVersion ?? body.expectedVersion ?? body.ops_version,
    reason: options.reason ?? body.reason,
    forceTransition: options.forceTransition ?? body.forceTransition,
    revisionReason: options.revisionReason ?? body.revisionReason,
    revisionNotes: options.revisionNotes ?? body.revisionNotes,
  };
  delete body.expectedVersion;
  delete body.ops_version;
  delete body.reason;
  delete body.forceTransition;
  delete body.revisionReason;
  delete body.revisionNotes;
  return mutateWork(id, body, actor, merged);
}

async function getActivityLog(leadId, limit = 50) {
  const hasTable = await queryAsync(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_activity_log'`
  ).catch(() => []);
  if (!hasTable.length) return [];
  const hasReason = await detectActivityLogReason();
  const reasonCol = hasReason ? ', reason' : '';
  return queryAsync(
    `SELECT id, event_type, field_name, old_value, new_value, actor, created_at${reasonCol}
     FROM lead_activity_log WHERE lead_id = ? ORDER BY id DESC LIMIT ?`,
    [leadId, limit]
  );
}

async function getAnalyticsDeliveryTrend(days = 14, filters = {}) {
  const spine = [];
  const today = todayYmdInTz(DEFAULT_TZ);
  for (let i = days - 1; i >= 0; i--) {
    const d = parseYmdLocal(today);
    d.setDate(d.getDate() - i);
    spine.push(formatYmd(d));
  }

  const params = [];
  let extra = buildSearchClause(filters.q, params);
  if (filters.agent) {
    extra += ' AND assign = ?';
    params.push(filters.agent);
  }

  const rows = await queryAsync(
    `
    SELECT DATE(deadline) AS dl, is_project_done
    FROM leads
    WHERE deadline IS NOT NULL
      AND deadline >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      AND deadline <= DATE_ADD(CURDATE(), INTERVAL 1 DAY)
      ${extra}
  `,
    [days - 1, ...params]
  ).catch(() => []);

  const normalized = (rows || []).map((r) => ({
    dl: String(r.dl).slice(0, 10),
    done: Number(r.is_project_done) === 1,
  }));

  return spine.map((day) => {
    const dueOnDay = normalized.filter((r) => r.dl === day);
    const due_total = dueOnDay.filter((r) => !r.done).length;
    const done = dueOnDay.filter((r) => r.done).length;
    const overdue = normalized.filter((r) => !r.done && r.dl < day).length;
    return { day, due_total, overdue, done };
  });
}

function parseYmdLocal(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function getMonthlyPerformance() {
  return queryAsync(`
    SELECT m.month AS month,
      COALESCE(x.leads_count, 0) AS leads_count,
      COALESCE(x.revenue, 0) AS revenue,
      COALESCE(x.profit, 0) AS profit
    FROM (
      SELECT 1 AS month UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
      UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
      UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
    ) m
    LEFT JOIN (
      SELECT MONTH(created_at) AS month, COUNT(*) AS leads_count,
        COALESCE(SUM(lead_price), 0) AS revenue,
        COALESCE(SUM(lead_price - agent_price), 0) AS profit
      FROM leads WHERE YEAR(created_at) = YEAR(CURDATE())
      GROUP BY MONTH(created_at)
    ) x ON x.month = m.month
    ORDER BY m.month ASC
  `);
}

async function getStatusDistribution(from, to) {
  return queryAsync(
    `SELECT status, COUNT(*) AS c FROM leads WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY status`,
    [from, to]
  );
}

async function getAgentsList() {
  const rows = await queryAsync(
    `SELECT DISTINCT assign FROM leads WHERE assign IS NOT NULL AND TRIM(assign) <> '' ORDER BY assign ASC`
  );
  return rows.map((r) => r.assign);
}

/** Cross-module search — server-side, limited rows, no full-table client load. */
async function searchWork(q, limit = 25) {
  const term = String(q || '').trim();
  if (!term || term.length < 1) {
    return { groups: [], total: 0 };
  }

  const cap = Math.min(50, Math.max(1, Number(limit) || 25));
  const params = [];
  const like = `%${term.replace(/%/g, '\\%')}%`;
  let where = `(enquiry LIKE ? OR name LIKE ? OR number LIKE ? OR assign LIKE ? OR remarks LIKE ? OR CAST(id AS CHAR) LIKE ?)`;
  params.push(like, like, like, like, like, like);

  if (/^\d+$/.test(term)) {
    where = `(id = ? OR ${where})`;
    params.unshift(Number(term));
  }

  const cols = await detectOpsColumns();
  const selectCols = cols
    ? `id, enquiry, name, number, assign, status, deadline, priority, delivery_stage`
    : `id, enquiry, name, number, assign, status, deadline`;

  const rows = await queryAsync(
    `SELECT ${selectCols} FROM leads WHERE ${where} ORDER BY id DESC LIMIT ?`,
    [...params, cap]
  );

  const items = (rows || []).map((r) => {
    const enriched = enrichLeadRow(r);
    let matchType = 'reference';
    const t = term.toLowerCase();
    if (String(r.id) === term) matchType = 'id';
    else if ((r.name || '').toLowerCase().includes(t)) matchType = 'client';
    else if ((r.enquiry || '').toLowerCase().includes(t)) matchType = 'project';
    else if ((r.assign || '').toLowerCase().includes(t)) matchType = 'agent';
    else if ((r.number || '').includes(term)) matchType = 'phone';
    return {
      id: r.id,
      enquiry: r.enquiry,
      name: r.name,
      number: r.number,
      assign: r.assign,
      deadline: r.deadline,
      matchType,
      delivery_stage_effective: enriched.delivery_stage_effective,
      urgency: enriched.urgency,
    };
  });

  const byType = {
    id: [],
    project: [],
    client: [],
    agent: [],
    phone: [],
    reference: [],
  };
  items.forEach((it) => {
    const k = byType[it.matchType] ? it.matchType : 'reference';
    byType[k].push(it);
  });

  const groups = [];
  const labels = {
    id: 'Work ID',
    project: 'Project / enquiry',
    client: 'Client name',
    agent: 'Agent',
    phone: 'Phone / lead ref',
    reference: 'Other matches',
  };
  Object.keys(labels).forEach((key) => {
    if (byType[key].length) groups.push({ key, label: labels[key], items: byType[key] });
  });

  return { groups, total: items.length };
}

module.exports = {
  detectOpsColumns,
  detectOpsVersion,
  getExecutiveKpis,
  getNavBadgeCounts,
  getPipelineCounts,
  listWork,
  getPriorityQueueCounts,
  getNeedsAttention,
  resolveMyAssignName,
  bulkMutateWork,
  getPriorityAttention,
  getExecutiveAttentionQueue,
  getTeamWorkload,
  getFinanceSummary,
  getWorkById,
  updateWorkField,
  patchWork,
  getActivityLog,
  getAnalyticsDeliveryTrend,
  getMonthlyPerformance,
  getStatusDistribution,
  getAgentsList,
  searchWork,
  activeWorkSql,
  moveWorkStage: (id, stage, actor, options) => mutateWork(id, { delivery_stage: stage }, actor, options),
};
