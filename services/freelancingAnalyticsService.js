'use strict';

const util = require('util');
const pool = require('../routes/pool');
const ops = require('./freelancingOpsService');
const { activeWorkSql } = ops;
const { RISK_ORDER } = require('../utils/freelancingDeliveryRisk');

const queryAsync = util.promisify(pool.query).bind(pool);

const RISK_DRILLDOWN = {
  overdue_delivery: '/freelancing/priority?view=overdue',
  blocked: '/freelancing/priority?view=blocked',
  revision_backlog: '/freelancing/delivery?mode=table&stage=revision_required',
  ready_not_delivered: '/freelancing/delivery?mode=table&stage=ready_for_delivery',
  pending_approval: '/freelancing/client-pending',
  at_risk: '/freelancing/priority?view=next48',
  on_track: '/freelancing/delivery',
};

const RISK_LABELS = {
  overdue_delivery: 'Overdue delivery',
  blocked: 'Blocked',
  revision_backlog: 'Revision backlog',
  ready_not_delivered: 'Ready · not delivered',
  pending_approval: 'Pending client approval',
  at_risk: 'Due soon',
  on_track: 'On track',
};

function buildFilterSql(filters, params, alias = 'l') {
  let sql = '';
  const p = alias ? `${alias}.` : '';
  if (filters.q) {
    const like = `%${String(filters.q).trim().replace(/%/g, '\\%')}%`;
    sql += ` AND (${p}enquiry LIKE ? OR ${p}name LIKE ? OR ${p}assign LIKE ? OR CAST(${p}id AS CHAR) LIKE ?)`;
    params.push(like, like, like, like);
  }
  if (filters.agent) {
    sql += ` AND ${p}assign = ?`;
    params.push(filters.agent);
  }
  return sql;
}

async function detectOpsColumns() {
  const rows = await queryAsync(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'delivery_stage'`
  ).catch(() => []);
  return rows.length > 0;
}

async function detectClientLifecycleColumns() {
  const rows = await queryAsync(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'client_dependency_status'`
  ).catch(() => []);
  return rows.length > 0;
}

async function getDataFreshness() {
  const [leadRow, activityRows] = await Promise.all([
    queryAsync(`SELECT MAX(created_at) AS latest_lead FROM leads`).then((r) => r[0] || {}),
    queryAsync(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_activity_log'`
    ).catch(() => []),
  ]);
  let latest_activity = null;
  if (activityRows.length) {
    const [a] = await queryAsync(`SELECT MAX(created_at) AS latest_activity FROM lead_activity_log`);
    latest_activity = a?.latest_activity || null;
  }
  return {
    latest_lead_at: leadRow?.latest_lead || null,
    latest_activity_at: latest_activity,
    timezone_note: 'Deadlines and “today” KPIs use Asia/Kolkata (IST) via server CURDATE() unless configured otherwise.',
    sync_note: 'Sheet sync is INSERT-only for existing financial and ops fields.',
  };
}

/**
 * Mutually exclusive delivery risk buckets (SQL mirror of freelancingDeliveryRisk.classifyDeliveryRisk).
 */
async function getDeliveryRiskCounts(filters = {}) {
  const hasOps = await detectOpsColumns();
  const params = [];
  const extra = buildFilterSql(filters, params);
  const active = activeWorkSql('l');

  if (!hasOps) {
    const [row] = await queryAsync(
      `
      SELECT
        SUM(CASE WHEN l.deadline IS NOT NULL AND l.deadline < CURDATE() THEN 1 ELSE 0 END) AS overdue_delivery,
        SUM(CASE WHEN l.status = 'in_changes' THEN 1 ELSE 0 END) AS revision_backlog,
        SUM(CASE WHEN l.status = 'client_review' THEN 1 ELSE 0 END) AS pending_approval,
        SUM(CASE WHEN l.deadline IS NOT NULL AND l.deadline >= CURDATE()
          AND l.deadline <= DATE_ADD(CURDATE(), INTERVAL 2 DAY) THEN 1 ELSE 0 END) AS at_risk,
        COUNT(*) AS total_active
      FROM leads l WHERE ${active} ${extra}
    `,
      params
    );
    const buckets = {
      overdue_delivery: Number(row?.overdue_delivery || 0),
      blocked: 0,
      revision_backlog: Number(row?.revision_backlog || 0),
      ready_not_delivered: 0,
      pending_approval: Number(row?.pending_approval || 0),
      at_risk: Number(row?.at_risk || 0),
      on_track: 0,
    };
    const assigned =
      buckets.overdue_delivery +
      buckets.revision_backlog +
      buckets.pending_approval +
      buckets.at_risk;
    buckets.on_track = Math.max(0, Number(row?.total_active || 0) - assigned);
    return formatRiskResponse(buckets, Number(row?.total_active || 0));
  }

  const [row] = await queryAsync(
    `
    SELECT
      SUM(CASE
        WHEN l.deadline IS NOT NULL AND l.deadline < CURDATE()
          AND COALESCE(l.delivery_stage,'') NOT IN ('delivered','closed') THEN 1 ELSE 0 END) AS overdue_delivery,
      SUM(CASE
        WHEN NOT (l.deadline IS NOT NULL AND l.deadline < CURDATE()
          AND COALESCE(l.delivery_stage,'') NOT IN ('delivered','closed'))
          AND l.blocker_reason IS NOT NULL AND TRIM(l.blocker_reason) <> '' THEN 1 ELSE 0 END) AS blocked,
      SUM(CASE
        WHEN NOT (l.deadline IS NOT NULL AND l.deadline < CURDATE()
          AND COALESCE(l.delivery_stage,'') NOT IN ('delivered','closed'))
          AND NOT (l.blocker_reason IS NOT NULL AND TRIM(l.blocker_reason) <> '')
          AND COALESCE(l.delivery_stage,'') = 'revision_required' THEN 1 ELSE 0 END) AS revision_backlog,
      SUM(CASE
        WHEN NOT (l.deadline IS NOT NULL AND l.deadline < CURDATE()
          AND COALESCE(l.delivery_stage,'') NOT IN ('delivered','closed'))
          AND NOT (l.blocker_reason IS NOT NULL AND TRIM(l.blocker_reason) <> '')
          AND COALESCE(l.delivery_stage,'') <> 'revision_required'
          AND COALESCE(l.delivery_stage,'') = 'ready_for_delivery' THEN 1 ELSE 0 END) AS ready_not_delivered,
      SUM(CASE
        WHEN NOT (l.deadline IS NOT NULL AND l.deadline < CURDATE()
          AND COALESCE(l.delivery_stage,'') NOT IN ('delivered','closed'))
          AND NOT (l.blocker_reason IS NOT NULL AND TRIM(l.blocker_reason) <> '')
          AND COALESCE(l.delivery_stage,'') NOT IN ('revision_required','ready_for_delivery')
          AND (COALESCE(l.delivery_stage,'') = 'client_review' OR LOWER(COALESCE(l.client_dependency,'')) = 'waiting_approval') THEN 1 ELSE 0 END) AS pending_approval,
      SUM(CASE
        WHEN NOT (l.deadline IS NOT NULL AND l.deadline < CURDATE()
          AND COALESCE(l.delivery_stage,'') NOT IN ('delivered','closed'))
          AND NOT (l.blocker_reason IS NOT NULL AND TRIM(l.blocker_reason) <> '')
          AND COALESCE(l.delivery_stage,'') NOT IN ('revision_required','ready_for_delivery','client_review')
          AND LOWER(COALESCE(l.client_dependency,'')) <> 'waiting_approval'
          AND l.deadline IS NOT NULL
          AND (l.deadline = CURDATE() OR l.deadline BETWEEN DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND DATE_ADD(CURDATE(), INTERVAL 2 DAY))
        THEN 1 ELSE 0 END) AS at_risk,
      COUNT(*) AS total_active
    FROM leads l
    WHERE ${active} ${extra}
  `,
    params
  );

  const buckets = {};
  RISK_ORDER.forEach((k) => {
    buckets[k] = Number(row?.[k] || 0);
  });
  const nonTrack = RISK_ORDER.filter((k) => k !== 'on_track').reduce((s, k) => s + (buckets[k] || 0), 0);
  buckets.on_track = Math.max(0, Number(row?.total_active || 0) - nonTrack);

  return formatRiskResponse(buckets, Number(row?.total_active || 0));
}

function formatRiskResponse(buckets, totalActive) {
  const items = RISK_ORDER.filter((k) => k !== 'on_track' || buckets[k] > 0).map((k) => ({
    id: k,
    label: RISK_LABELS[k] || k,
    count: buckets[k] || 0,
    href: RISK_DRILLDOWN[k] || '/freelancing/delivery',
  }));
  return {
    buckets,
    items: items.filter((i) => i.id !== 'on_track' || i.count > 0),
    total_active: totalActive,
    exclusive: true,
    note: 'Each active job is counted once in its highest-severity risk bucket (matches delivery risk rules).',
  };
}

async function getMonthlyFinancialSeries(from, to, filters = {}) {
  const params = [from, to];
  const extra = buildFilterSql(filters, params);
  const rows = await queryAsync(
    `
    SELECT DATE_FORMAT(l.created_at, '%Y-%m') AS ym,
      COUNT(*) AS leads_count,
      SUM(CASE WHEN l.is_project_done = 1 THEN 1 ELSE 0 END) AS completed_count,
      COALESCE(SUM(l.lead_price), 0) AS revenue,
      COALESCE(SUM(l.agent_price), 0) AS agent_cost,
      COALESCE(SUM(l.lead_price - l.agent_price), 0) AS gross_profit
    FROM leads l
    WHERE DATE(l.created_at) BETWEEN ? AND ? ${extra}
    GROUP BY DATE_FORMAT(l.created_at, '%Y-%m')
    ORDER BY ym ASC
  `,
    params
  );
  return rows.map((r) => {
    const leads = Number(r.leads_count || 0);
    const completed = Number(r.completed_count || 0);
    return {
      month: r.ym,
      leads_count: leads,
      completed_count: completed,
      conversion_rate: leads ? Math.round((completed / leads) * 1000) / 10 : null,
      revenue: Number(r.revenue || 0),
      agent_cost: Number(r.agent_cost || 0),
      gross_profit: Number(r.gross_profit || 0),
    };
  });
}

async function getConversionSeries(from, to, filters = {}) {
  const params = [from, to];
  const extra = buildFilterSql(filters, params);
  const hasCompletedAt = await queryAsync(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'internal_completed_at'`
  ).catch(() => []);
  const completedExpr = hasCompletedAt.length
    ? `(l.is_project_done = 1 OR l.internal_completed_at IS NOT NULL)`
    : `l.is_project_done = 1`;

  const [row] = await queryAsync(
    `
    SELECT
      COUNT(*) AS created,
      SUM(CASE WHEN ${completedExpr} THEN 1 ELSE 0 END) AS completed
    FROM leads l
    WHERE DATE(l.created_at) BETWEEN ? AND ? ${extra}
  `,
    params
  );
  const created = Number(row?.created || 0);
  const completed = Number(row?.completed || 0);
  return {
    created,
    completed,
    completion_rate: created ? Math.round((completed / created) * 1000) / 10 : null,
    basis: 'Leads with created_at in range; completed = is_project_done (or internal_completed_at when migrated).',
  };
}

async function getOnTimeDeliveryRate(from, to, filters = {}) {
  const params = [from, to];
  const extra = buildFilterSql(filters, params);
  const hasDeliveredAt = await queryAsync(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'delivered_at'`
  ).catch(() => []);

  const doneDateExpr = hasDeliveredAt.length
    ? `COALESCE(DATE(l.delivered_at), DATE(l.internal_completed_at), CASE WHEN l.is_project_done=1 THEN DATE(l.deadline) END)`
    : `COALESCE(DATE(l.internal_completed_at), CASE WHEN l.is_project_done=1 THEN DATE(l.deadline) END)`;

  const [row] = await queryAsync(
    `
    SELECT
      COUNT(*) AS due_in_range,
      SUM(CASE WHEN l.is_project_done = 1 AND ${doneDateExpr} IS NOT NULL AND ${doneDateExpr} <= DATE(l.deadline) THEN 1 ELSE 0 END) AS on_time,
      SUM(CASE WHEN l.is_project_done = 1 AND ${doneDateExpr} IS NOT NULL AND ${doneDateExpr} > DATE(l.deadline) THEN 1 ELSE 0 END) AS late
    FROM leads l
    WHERE l.deadline IS NOT NULL AND DATE(l.deadline) BETWEEN ? AND ? ${extra}
  `,
    params
  );
  const due = Number(row?.due_in_range || 0);
  const onTime = Number(row?.on_time || 0);
  const late = Number(row?.late || 0);
  const finished = onTime + late;
  return {
    due_in_range: due,
    on_time: onTime,
    late,
    open_not_done: Math.max(0, due - finished),
    on_time_rate: finished ? Math.round((onTime / finished) * 1000) / 10 : null,
    basis: 'Deadline date in selected range; on-time = completed with done date on or before deadline.',
    date_field: 'deadline',
  };
}

async function getDeliveryCompletionTrend(days = 14, filters = {}) {
  const params = [days - 1];
  const extra = buildFilterSql(filters, params);
  const hasDelivered = await queryAsync(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME IN ('internal_completed_at','delivered_at')`
  ).catch(() => []);
  const names = new Set((hasDelivered || []).map((r) => r.COLUMN_NAME));
  const doneOnExpr = names.has('internal_completed_at')
    ? names.has('delivered_at')
      ? `DATE(COALESCE(l.internal_completed_at, l.delivered_at))`
      : `DATE(l.internal_completed_at)`
    : `DATE(l.created_at)`;

  const rows = await queryAsync(
    `
    SELECT ${doneOnExpr} AS completion_day, COUNT(*) AS completed
    FROM leads l
    WHERE l.is_project_done = 1
      AND ${doneOnExpr} >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      ${extra}
    GROUP BY completion_day
    ORDER BY completion_day ASC
  `,
    params
  ).catch(() => []);

  const map = {};
  (rows || []).forEach((r) => {
    map[String(r.completion_day).slice(0, 10)] = Number(r.completed || 0);
  });

  const spine = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ymd = d.toISOString().slice(0, 10);
    spine.push({ day: ymd, completed: map[ymd] || 0 });
  }
  return spine;
}

async function getClientWaitingStats(filters = {}) {
  const hasLifecycle = await detectClientLifecycleColumns();
  const openSql = hasLifecycle
    ? `l.client_dependency <> 'none' AND (l.client_dependency_status IS NULL OR l.client_dependency_status <> 'resolved')`
    : `l.client_dependency <> 'none'`;
  const params = [];
  const extra = buildFilterSql(filters, params);
  const [row] = await queryAsync(
    `
    SELECT
      COUNT(*) AS open_count,
      AVG(CASE WHEN l.client_dependency_opened_at IS NOT NULL
        THEN TIMESTAMPDIFF(DAY, l.client_dependency_opened_at, NOW()) END) AS avg_days_waiting
    FROM leads l
    WHERE ${openSql} ${extra}
  `,
    params
  ).catch(() => [{}]);
  return {
    open_dependencies: Number(row?.open_count || 0),
    avg_days_waiting:
      row?.avg_days_waiting != null ? Math.round(Number(row.avg_days_waiting) * 10) / 10 : null,
    basis: 'Open client dependencies only; average days since client_dependency_opened_at when set.',
  };
}

async function getAgentWorkloadDistribution(filters = {}) {
  const params = [];
  const extra = buildFilterSql(filters, params);
  const active = activeWorkSql('l');
  const rows = await queryAsync(
    `
    SELECT IF(l.assign IS NULL OR TRIM(l.assign)='', 'Unassigned', l.assign) AS agent_name,
      COUNT(*) AS active_tasks,
      COUNT(CASE WHEN l.deadline IS NOT NULL AND l.deadline < CURDATE() THEN 1 END) AS overdue
    FROM leads l
    WHERE ${active} ${extra}
    GROUP BY IF(l.assign IS NULL OR TRIM(l.assign)='', 'Unassigned', l.assign)
    ORDER BY active_tasks DESC
    LIMIT 20
  `,
    params
  );
  return rows.map((r) => ({
    agent_name: r.agent_name,
    active_tasks: Number(r.active_tasks || 0),
    overdue: Number(r.overdue || 0),
  }));
}

async function getMonthlyWorkStatusYtd(filters = {}) {
  const hasOps = await detectOpsColumns();
  const params = [];
  const extra = buildFilterSql(filters, params);
  const groupField = hasOps ? `COALESCE(l.delivery_stage, 'unassigned')` : `COALESCE(l.status, 'unknown')`;

  const rows = await queryAsync(
    `
    SELECT MONTH(l.created_at) AS month, ${groupField} AS bucket, COUNT(*) AS c
    FROM leads l
    WHERE YEAR(l.created_at) = YEAR(CURDATE()) ${extra}
    GROUP BY MONTH(l.created_at), bucket
    ORDER BY month ASC, bucket ASC
  `,
    params
  );

  const byMonth = {};
  for (let m = 1; m <= 12; m++) {
    byMonth[m] = { month: m, buckets: {}, total: 0 };
  }
  rows.forEach((r) => {
    const m = Number(r.month);
    if (!byMonth[m]) return;
    const c = Number(r.c || 0);
    byMonth[m].buckets[r.bucket] = c;
    byMonth[m].total += c;
  });
  return Object.values(byMonth);
}

async function getAnalyticsBundle(filters = {}) {
  const from = filters.from;
  const to = filters.to;
  const trendDays = Math.min(31, Math.max(7, Number(filters.trend_days) || 14));

  const statusParams = [from, to];
  const statusExtra = buildFilterSql(filters, statusParams);

  const [
    financialSeries,
    conversion,
    onTime,
    deliveryTrend,
    completionTrend,
    clientWaiting,
    agentWorkload,
    monthlyStatus,
    statusDistribution,
  ] = await Promise.all([
    getMonthlyFinancialSeries(from, to, filters),
    getConversionSeries(from, to, filters),
    getOnTimeDeliveryRate(from, to, filters),
    ops.getAnalyticsDeliveryTrend(trendDays, filters),
    getDeliveryCompletionTrend(trendDays, filters),
    getClientWaitingStats(filters),
    getAgentWorkloadDistribution(filters),
    getMonthlyWorkStatusYtd(filters),
    queryAsync(
      `SELECT l.status, COUNT(*) AS c FROM leads l WHERE DATE(l.created_at) BETWEEN ? AND ? ${statusExtra} GROUP BY l.status`,
      statusParams
    ),
  ]);

  const overdueTrend = (deliveryTrend || []).map((d) => ({
    day: d.day,
    overdue_backlog: d.overdue,
    due_open: d.due_total,
    completed_on_day: d.done,
  }));

  return {
    definitions: {
      financial_range: {
        label: 'Financial & intake metrics',
        date_field: 'created_at',
        from,
        to,
        scope: 'All leads created in range (INR lead_price / agent_price; PKR excluded).',
        exclusions: 'Lost/cancelled rows still included if created in range — filter in ops lists if needed.',
      },
      delivery_deadline: {
        label: 'On-time delivery',
        date_field: 'deadline',
        from,
        to,
        scope: 'Jobs with deadline falling in range.',
      },
      delivery_trend_window: {
        label: 'Rolling delivery trends',
        days: trendDays,
        note: 'Overdue backlog counted at end of each calendar day; completion trend uses completion timestamps.',
      },
      active_kpis: {
        label: 'Dashboard operational KPIs',
        scope: 'Active work only (not done, not delivered/closed stage, status not completed/lost/cancelled).',
        date_field: 'deadline vs CURDATE() for overdue/today — not filtered by created_at unless dashboard filters applied.',
      },
    },
    financialSeries,
    conversion,
    onTime,
    overdueTrend,
    completionTrend,
    clientWaiting,
    agentWorkload,
    monthlyStatus,
    statusDistribution: (statusDistribution || []).map((r) => ({
      status: r.status || 'unknown',
      count: Number(r.c || 0),
    })),
    deliveryTrend,
  };
}

function csvEscape(val) {
  const s = val == null ? '' : String(val);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function exportCsv(type, filters = {}) {
  const t = (type || 'financial').toLowerCase();
  const lines = [];

  if (t === 'financial' || t === 'revenue') {
    const series = await getMonthlyFinancialSeries(filters.from, filters.to, filters);
    lines.push('month,leads_count,revenue_inr,agent_cost_inr,gross_profit_inr');
    series.forEach((r) => {
      lines.push([r.month, r.leads_count, r.revenue, r.agent_cost, r.gross_profit].map(csvEscape).join(','));
    });
    return lines.join('\n');
  }

  if (t === 'workload') {
    const rows = await getAgentWorkloadDistribution(filters);
    lines.push('agent,active_tasks,overdue');
    rows.forEach((r) => {
      lines.push([r.agent_name, r.active_tasks, r.overdue].map(csvEscape).join(','));
    });
    return lines.join('\n');
  }

  if (t === 'status') {
    const bundle = await getAnalyticsBundle(filters);
    lines.push('status,count');
    bundle.statusDistribution.forEach((r) => {
      lines.push([r.status, r.count].map(csvEscape).join(','));
    });
    return lines.join('\n');
  }

  const bundle = await getAnalyticsBundle(filters);
  lines.push('metric,value,note');
  lines.push(['conversion_created', bundle.conversion.created, 'created_at in range'].map(csvEscape).join(','));
  lines.push(['conversion_completed', bundle.conversion.completed, ''].map(csvEscape).join(','));
  lines.push(['on_time_rate_pct', bundle.onTime.on_time_rate ?? '', bundle.onTime.basis].map(csvEscape).join(','));
  return lines.join('\n');
}

module.exports = {
  getDataFreshness,
  getDeliveryRiskCounts,
  getAnalyticsBundle,
  exportCsv,
  getMonthlyFinancialSeries,
  RISK_LABELS,
};
