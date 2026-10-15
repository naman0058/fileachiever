'use strict';

const util = require('util');
const pool = require('../routes/pool');
const { enrichLeadRow, deriveDeliveryStage } = require('../utils/freelancingOpsMap');
const {
  DEFAULT_CAPACITY_POINTS,
  effortPointsForLead,
  utilization,
  loadStatus,
  loadStatusLabel,
  suggestAgentsForWork,
} = require('../utils/freelancingWorkload');

const queryAsync = util.promisify(pool.query).bind(pool);

function activeWorkSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `(
    ${p}is_project_done = 0
    AND (LOWER(COALESCE(${p}status,'')) NOT IN ('completed','lost','cancelled'))
    AND (COALESCE(${p}delivery_stage,'') NOT IN ('delivered','closed') OR ${p}delivery_stage IS NULL)
  )`;
}

let _hasEffortCol = null;
let _hasCapacityTable = null;

async function detectEffortColumn() {
  if (_hasEffortCol !== null) return _hasEffortCol;
  try {
    const rows = await queryAsync(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'estimated_effort_points'`
    );
    _hasEffortCol = rows.length > 0;
  } catch (_) {
    _hasEffortCol = false;
  }
  return _hasEffortCol;
}

async function detectCapacityTable() {
  if (_hasCapacityTable !== null) return _hasCapacityTable;
  try {
    const rows = await queryAsync(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'freelancing_agent_capacity'`
    );
    _hasCapacityTable = rows.length > 0;
  } catch (_) {
    _hasCapacityTable = false;
  }
  return _hasCapacityTable;
}

async function detectOpsColumns() {
  const rows = await queryAsync(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'delivery_stage'`
  ).catch(() => []);
  return rows.length > 0;
}

async function upsertAgentCapacity(agentName, patch) {
  const has = await detectCapacityTable();
  if (!has || !agentName) return { success: false, message: 'Capacity table not migrated' };
  const existing = await queryAsync(`SELECT agent_name FROM freelancing_agent_capacity WHERE agent_name = ?`, [
    agentName,
  ]);
  if (!existing.length) {
    await queryAsync(
      `INSERT INTO freelancing_agent_capacity (agent_name, team_name, capacity_points, capacity_hours, skills) VALUES (?,?,?,?,?)`,
      [
        agentName,
        patch.team_name || null,
        patch.capacity_points != null ? patch.capacity_points : DEFAULT_CAPACITY_POINTS,
        patch.capacity_hours || null,
        patch.skills ? JSON.stringify(patch.skills) : null,
      ]
    );
  } else {
    const fields = [];
    const params = [];
    ['team_name', 'capacity_points', 'capacity_hours', 'skills'].forEach((k) => {
      if (patch[k] !== undefined) {
        fields.push(`${k} = ?`);
        params.push(k === 'skills' && patch[k] ? JSON.stringify(patch[k]) : patch[k]);
      }
    });
    if (fields.length) {
      params.push(agentName);
      await queryAsync(`UPDATE freelancing_agent_capacity SET ${fields.join(', ')} WHERE agent_name = ?`, params);
    }
  }
  return { success: true };
}

async function getAgentCapacityMap() {
  const has = await detectCapacityTable();
  const map = {};
  if (has) {
    const rows = await queryAsync(`SELECT agent_name, team_name, capacity_points, capacity_hours, skills FROM freelancing_agent_capacity`);
    rows.forEach((r) => {
      map[r.agent_name] = r;
    });
  }
  return map;
}

async function getTeamWorkloadDashboard(filters = {}) {
  const hasOps = await detectOpsColumns();
  const hasEffort = await detectEffortColumn();
  const active = activeWorkSql();
  const crit = hasOps ? `COUNT(CASE WHEN priority='critical' THEN 1 END) AS critical_tasks,` : '0 AS critical_tasks,';
  const blocked = hasOps
    ? `COUNT(CASE WHEN blocker_reason IS NOT NULL AND TRIM(blocker_reason)<>'' THEN 1 END) AS blocked_tasks,`
    : '0 AS blocked_tasks,';
  const waitingClient = hasOps
    ? `COUNT(CASE WHEN client_dependency IS NOT NULL AND client_dependency <> 'none' THEN 1 END) AS waiting_for_client,`
    : `COUNT(CASE WHEN status='client_review' THEN 1 END) AS waiting_for_client,`;

  const rows = await queryAsync(`
    SELECT
      IF(assign IS NULL OR TRIM(assign)='', 'Unassigned', assign) AS agent_name,
      COUNT(*) AS active_tasks,
      COUNT(CASE WHEN deadline IS NOT NULL AND deadline < CURDATE() THEN 1 END) AS overdue_tasks,
      COUNT(CASE WHEN deadline = CURDATE() THEN 1 END) AS due_today,
      COUNT(CASE WHEN status='in_progress' THEN 1 END) AS in_progress,
      ${waitingClient}
      ${crit}
      ${blocked}
      COUNT(CASE WHEN is_project_done=1 THEN 1 END) AS completed_active_flag
    FROM leads
    WHERE ${active}
    GROUP BY IF(assign IS NULL OR TRIM(assign)='', 'Unassigned', assign)
    ORDER BY active_tasks DESC
  `);

  const completed7d = await queryAsync(`
    SELECT IF(assign IS NULL OR TRIM(assign)='', 'Unassigned', assign) AS agent_name, COUNT(*) AS completed_7d
    FROM leads
    WHERE is_project_done = 1 AND COALESCE(internal_completed_at, created_at) >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY IF(assign IS NULL OR TRIM(assign)='', 'Unassigned', assign)
  `).catch(() => []);
  const completedMap = {};
  completed7d.forEach((r) => {
    completedMap[r.agent_name] = Number(r.completed_7d || 0);
  });

  let effortByAgent = {};
  if (hasEffort || hasOps) {
    const effortExpr = hasEffort
      ? `COALESCE(estimated_effort_points, CASE priority WHEN 'critical' THEN 8 WHEN 'high' THEN 5 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 3 END)`
      : hasOps
        ? `CASE priority WHEN 'critical' THEN 8 WHEN 'high' THEN 5 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 3 END`
        : '3';
    const effortRows = await queryAsync(`
      SELECT IF(assign IS NULL OR TRIM(assign)='', 'Unassigned', assign) AS agent_name,
        SUM(${effortExpr}) AS assigned_effort_points
      FROM leads WHERE ${active}
      GROUP BY IF(assign IS NULL OR TRIM(assign)='', 'Unassigned', assign)
    `);
    effortRows.forEach((r) => {
      effortByAgent[r.agent_name] = Number(r.assigned_effort_points || 0);
    });
  }

  const capMap = await getAgentCapacityMap();
  const teamFilter = (filters.team || '').trim();
  const agentFilter = (filters.agent || '').trim();

  let enriched = rows.map((r) => {
    const capRow = capMap[r.agent_name] || {};
    const capacity_points = Number(capRow.capacity_points) || DEFAULT_CAPACITY_POINTS;
    const assigned_effort_points = effortByAgent[r.agent_name] || 0;
    const util = utilization(assigned_effort_points, capacity_points);
    const status = loadStatus(util.pct);
    return {
      ...r,
      active_tasks: Number(r.active_tasks || 0),
      overdue_tasks: Number(r.overdue_tasks || 0),
      due_today: Number(r.due_today || 0),
      in_progress: Number(r.in_progress || 0),
      waiting_for_client: Number(r.waiting_for_client || 0),
      critical_tasks: Number(r.critical_tasks || 0),
      blocked_tasks: Number(r.blocked_tasks || 0),
      completed_7d: completedMap[r.agent_name] || 0,
      team_name: capRow.team_name || null,
      capacity_points,
      capacity_hours: capRow.capacity_hours != null ? Number(capRow.capacity_hours) : null,
      capacity_unit: 'effort_points',
      capacity_fallback_note: util.note,
      assigned_effort_points,
      utilization_pct: util.pct,
      load_status: status,
      load_status_label: loadStatusLabel(status),
      available_capacity_points: Math.max(0, capacity_points - assigned_effort_points),
      skills: capRow.skills || null,
    };
  });

  if (teamFilter && teamFilter !== 'all') {
    if (teamFilter === 'unassigned') {
      enriched = enriched.filter((a) => a.agent_name === 'Unassigned');
    } else {
      enriched = enriched.filter((a) => (a.team_name || '') === teamFilter);
    }
  }
  if (agentFilter) {
    enriched = enriched.filter((a) => a.agent_name === agentFilter);
  }

  const teams = [...new Set(Object.values(capMap).map((c) => c.team_name).filter(Boolean))];

  return {
    agents: enriched.filter((a) => a.agent_name !== 'Unassigned'),
    unassigned_bucket: enriched.find((a) => a.agent_name === 'Unassigned') || null,
    teams,
    effort_model: hasEffort
      ? 'estimated_effort_points with priority fallback'
      : 'priority-based effort points (fallback — not precise hours)',
  };
}

async function getAgentWorkloadDetail(agentName) {
  if (!agentName || agentName === 'Unassigned') {
    return { success: false, message: 'Invalid agent' };
  }
  const hasOps = await detectOpsColumns();
  const hasEffort = await detectEffortColumn();
  let cols;
  if (hasOps) {
    cols =
      'id, enquiry, name, deadline, priority, delivery_stage, assign, status, blocker_reason';
    if (hasEffort) cols += ', estimated_effort_points';
    cols += ', is_project_done, internal_completed_at';
  } else {
    cols = 'id, enquiry, name, deadline, assign, status, is_project_done, created_at';
  }

  const active = await queryAsync(
    `SELECT ${cols} FROM leads WHERE ${activeWorkSql()} AND assign = ? ORDER BY deadline IS NULL, deadline ASC`,
    [agentName]
  );

  const completed = await queryAsync(
    `SELECT ${cols} FROM leads WHERE assign = ? AND is_project_done = 1 ORDER BY internal_completed_at DESC LIMIT 15`,
    [agentName]
  ).catch(() =>
    queryAsync(`SELECT ${cols} FROM leads WHERE assign = ? AND is_project_done = 1 ORDER BY id DESC LIMIT 15`, [
      agentName,
    ])
  );

  const assignmentHistory = await queryAsync(
    `SELECT lal.lead_id, lal.old_value, lal.new_value, lal.actor, lal.created_at, lal.reason
     FROM lead_activity_log lal
     INNER JOIN leads l ON l.id = lal.lead_id
     WHERE lal.field_name = 'assign' AND (l.assign = ? OR lal.new_value = ? OR lal.old_value = ?)
     ORDER BY lal.id DESC LIMIT 40`,
    [agentName, agentName, agentName]
  ).catch(() => []);

  const dashboard = await getTeamWorkloadDashboard({});
  const agentStat = dashboard.agents.find((a) => a.agent_name === agentName);

  const priorityMix = { critical: 0, high: 0, medium: 0, low: 0 };
  const stageMix = {};
  active.forEach((r) => {
    const e = enrichLeadRow(r);
    const p = e.priority_effective || 'medium';
    if (priorityMix[p] !== undefined) priorityMix[p]++;
    const st = e.delivery_stage_effective || 'unknown';
    stageMix[st] = (stageMix[st] || 0) + 1;
  });

  return {
    success: true,
    agent_name: agentName,
    summary: agentStat || null,
    assigned_tasks: active.map((r) => enrichLeadRow(r)),
    recently_completed: completed.map((r) => enrichLeadRow(r)),
    priority_mix: priorityMix,
    stage_mix: stageMix,
    assignment_history: assignmentHistory,
  };
}

async function assignWork(workId, assignee, actor, options = {}) {
  const ops = require('./freelancingOpsService');
  const assign = (assignee || '').trim();
  if (!assign) return { success: false, message: 'Assignee required' };

  const work = await ops.getWorkById(workId);
  if (!work) return { success: false, message: 'Not found' };

  const patch = { assign };
  const stage = deriveDeliveryStage(work);
  const hasOps = await detectOpsColumns();
  if (hasOps && (stage === 'unassigned' || !work.assign)) {
    patch.delivery_stage = 'assigned';
  }

  const reason = options.note
    ? `Assignment: ${options.note}`
    : options.reassign
      ? 'Reassignment'
      : 'Assignment';

  return ops.patchWork(workId, patch, actor, {
    expectedVersion: options.expectedVersion,
    reason,
  });
}

async function bulkAssignWork(ids, assignee, actor, note) {
  const results = [];
  for (const id of [...new Set((ids || []).map(Number).filter((n) => n > 0))].slice(0, 100)) {
    const r = await assignWork(id, assignee, actor, { note, reassign: true });
    results.push({ id, success: !!r.success, message: r.message, code: r.code });
  }
  const succeeded = results.filter((r) => r.success).length;
  return { success: succeeded > 0, succeeded, failed: results.length - succeeded, results };
}

async function getAssignmentSuggestions(workId) {
  const ops = require('./freelancingOpsService');
  const work = await ops.getWorkById(workId);
  if (!work) return { success: false, message: 'Not found' };
  const dashboard = await getTeamWorkloadDashboard({});
  const suggestions = suggestAgentsForWork(work, dashboard.agents, 5);
  return { success: true, work_id: workId, suggestions, transparent_rules: true };
}

async function listTeamsForUser(sessionAffiliation) {
  const capMap = await getAgentCapacityMap();
  const teams = [...new Set(Object.values(capMap).map((c) => c.team_name).filter(Boolean))];
  const ops = require('./freelancingOpsService');
  const myName = await ops.resolveMyAssignName(sessionAffiliation);
  let myTeam = myName && capMap[myName] ? capMap[myName].team_name : null;
  const restrict = process.env.FREELANCING_OPS_RESTRICT_TEAMS === '1';
  const managers = (process.env.FREELANCING_OPS_MANAGER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const isManager = sessionAffiliation && managers.includes(String(sessionAffiliation));
  return { teams, myTeam, myName, restrictTeams: restrict && !isManager };
}

module.exports = {
  detectEffortColumn,
  detectCapacityTable,
  getTeamWorkloadDashboard,
  getAgentWorkloadDetail,
  assignWork,
  bulkAssignWork,
  getAssignmentSuggestions,
  upsertAgentCapacity,
  listTeamsForUser,
};
