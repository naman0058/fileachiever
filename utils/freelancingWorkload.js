'use strict';

const DEFAULT_CAPACITY_POINTS = Number(process.env.FREELANCING_OPS_DEFAULT_CAPACITY_POINTS) || 40;
const UTIL_HIGH = Number(process.env.FREELANCING_OPS_UTIL_HIGH) || 0.85;
const UTIL_OVERLOAD = Number(process.env.FREELANCING_OPS_UTIL_OVERLOAD) || 1.0;

const PRIORITY_EFFORT_FALLBACK = {
  critical: 8,
  high: 5,
  medium: 3,
  low: 2,
};

function effortPointsForLead(lead) {
  const explicit = lead.estimated_effort_points;
  if (explicit != null && explicit !== '' && !Number.isNaN(Number(explicit))) {
    return Number(explicit);
  }
  const p = (lead.priority_effective || lead.priority || 'medium').toLowerCase();
  return PRIORITY_EFFORT_FALLBACK[p] || PRIORITY_EFFORT_FALLBACK.medium;
}

function utilization(assignedPoints, capacityPoints) {
  const cap = Number(capacityPoints) || DEFAULT_CAPACITY_POINTS;
  if (cap <= 0) return { pct: null, note: 'Capacity not configured — task counts shown separately.' };
  const pct = Math.round((Number(assignedPoints) / cap) * 1000) / 10;
  return { pct, note: null };
}

function loadStatus(utilPct) {
  if (utilPct == null) return 'unknown';
  const high = UTIL_HIGH * 100;
  const overload = UTIL_OVERLOAD * 100;
  if (utilPct < 50) return 'available';
  if (utilPct < high) return 'normal';
  if (utilPct < overload) return 'high_load';
  return 'overloaded';
}

function loadStatusLabel(status) {
  const m = {
    available: 'Available',
    normal: 'Normal',
    high_load: 'High load',
    overloaded: 'Overloaded',
    unknown: 'Unknown',
  };
  return m[status] || status;
}

/**
 * Deterministic assignment ranking (lower rank = better suggestion).
 * Rules: lowest utilization → fewest overdue → fewest active tasks → alphabetical.
 */
function rankAgentForAssignment(agentStat) {
  const util = agentStat.utilization_pct != null ? agentStat.utilization_pct : 999;
  return [
    util,
    agentStat.overdue_tasks || 0,
    agentStat.active_tasks || 0,
    (agentStat.agent_name || '').toLowerCase(),
  ];
}

function compareAgentRank(a, b) {
  const ra = rankAgentForAssignment(a);
  const rb = rankAgentForAssignment(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] < rb[i]) return -1;
    if (ra[i] > rb[i]) return 1;
  }
  return 0;
}

function suggestAgentsForWork(work, agentStats, limit = 5) {
  const effort = effortPointsForLead(work);
  const sorted = (agentStats || [])
    .filter((a) => a.agent_name && a.agent_name !== 'Unassigned')
    .slice()
    .sort(compareAgentRank);
  return sorted.slice(0, limit).map((a, idx) => ({
    rank: idx + 1,
    agent_name: a.agent_name,
    active_tasks: a.active_tasks,
    overdue_tasks: a.overdue_tasks,
    utilization_pct: a.utilization_pct,
    load_status: a.load_status,
    capacity_points: a.capacity_points,
    assigned_effort_points: a.assigned_effort_points,
    available_capacity_points: a.available_capacity_points,
    projected_utilization_pct:
      a.capacity_points > 0
        ? Math.round(((a.assigned_effort_points + effort) / a.capacity_points) * 1000) / 10
        : null,
    rule: 'Lowest utilization, then overdue, then active count',
  }));
}

module.exports = {
  DEFAULT_CAPACITY_POINTS,
  UTIL_HIGH,
  UTIL_OVERLOAD,
  PRIORITY_EFFORT_FALLBACK,
  effortPointsForLead,
  utilization,
  loadStatus,
  loadStatusLabel,
  suggestAgentsForWork,
  compareAgentRank,
};
