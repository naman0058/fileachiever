'use strict';

const { todayYmdInTz, parseYmd, addDaysYmd, daysBetweenYmd, DEFAULT_TZ } = require('./freelancingOpsDates');

const DELIVERY_STAGES = [
  'unassigned',
  'assigned',
  'in_progress',
  'internal_review',
  'client_review',
  'revision_required',
  'ready_for_delivery',
  'delivered',
  'closed',
];

const PRIORITIES = ['critical', 'high', 'medium', 'low'];

/** Legacy `status` values used as work execution status (not free-text agent names). */
const LEGACY_EXECUTION_STATUSES = new Set([
  'pending',
  'assign',
  'in_progress',
  'client_review',
  'in_changes',
  'hold',
  'completed',
  'lost',
  'cancelled',
]);

function isLegacyExecutionStatus(s) {
  return LEGACY_EXECUTION_STATUSES.has(normStatus(s));
}

/** Map delivery_stage → legacy execution status when status is workflow-like. */
function legacyStatusForStage(stage) {
  const m = {
    unassigned: 'pending',
    assigned: 'assign',
    in_progress: 'in_progress',
    internal_review: 'in_progress',
    client_review: 'client_review',
    revision_required: 'in_changes',
    ready_for_delivery: 'client_review',
    delivered: 'completed',
    closed: 'completed',
  };
  return m[(stage || '').toLowerCase()] || null;
}

function trimAssign(v) {
  const s = (v || '').toString().trim();
  return s || null;
}

function normStatus(s) {
  return (s || '').toString().trim().toLowerCase();
}

/**
 * Derive workflow stage when delivery_stage column is NULL (legacy rows).
 * is_project_done = internal completion toggle — not auto "delivered".
 */
function deriveDeliveryStage(lead) {
  if (!lead) return 'unassigned';
  const explicit = (lead.delivery_stage || '').toString().trim().toLowerCase();
  if (explicit && DELIVERY_STAGES.includes(explicit)) return explicit;

  const assign = trimAssign(lead.assign);
  const st = normStatus(lead.status);
  const done = Number(lead.is_project_done) === 1;

  if (done) {
    if (Number(lead.is_payment_received) === 1 && Number(lead.is_agent_payment_done) === 1) return 'closed';
    return 'ready_for_delivery';
  }

  if (!assign) return 'unassigned';

  if (st === 'client_review') return 'client_review';
  if (st === 'in_changes') return 'revision_required';
  if (st === 'in_progress') return 'in_progress';
  if (st === 'assign' || st === 'pending') return 'assigned';
  if (st === 'completed') return 'ready_for_delivery';
  if (st === 'hold') return assign ? 'in_progress' : 'unassigned';

  return 'assigned';
}

function isActiveWork(lead) {
  if (!lead) return false;
  const st = normStatus(lead.status);
  if (st === 'completed' || st === 'lost' || st === 'cancelled') return false;
  if (Number(lead.is_project_done) === 1) return false;
  const stage = deriveDeliveryStage(lead);
  if (stage === 'closed' || stage === 'delivered') return false;
  return true;
}

function urgencyBucket(lead, tz = DEFAULT_TZ) {
  if (!isActiveWork(lead)) return 'inactive';
  const today = todayYmdInTz(tz);
  const dl = lead.deadline ? String(lead.deadline).slice(0, 10) : null;
  if (!dl) return 'unscheduled';
  const diff = daysBetweenYmd(today, dl);
  if (diff === null) return 'unscheduled';
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'due_today';
  if (diff <= 2) return 'next_48h';
  return 'scheduled';
}

const STAGE_TRANSITIONS = {
  unassigned: ['assigned', 'in_progress'],
  assigned: ['in_progress', 'internal_review', 'unassigned'],
  in_progress: ['internal_review', 'client_review', 'revision_required', 'ready_for_delivery', 'assigned'],
  internal_review: ['in_progress', 'client_review', 'ready_for_delivery'],
  client_review: ['revision_required', 'ready_for_delivery', 'delivered'],
  revision_required: ['in_progress', 'internal_review', 'client_review'],
  ready_for_delivery: ['delivered', 'client_review', 'revision_required'],
  delivered: ['closed', 'revision_required'],
  closed: ['revision_required'],
};

function canTransitionStage(from, to, options = {}) {
  if (!from || !to || from === to) return true;
  if (options.force) return true;
  const allowed = STAGE_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

function prioritySortWeight(p) {
  const m = { critical: 4, high: 3, medium: 2, low: 1 };
  return m[(p || 'medium').toLowerCase()] || 2;
}

function formatTimeRemaining(lead, tz = DEFAULT_TZ) {
  const today = todayYmdInTz(tz);
  const dl = lead.deadline ? String(lead.deadline).slice(0, 10) : null;
  if (!dl) return { label: 'No deadline', kind: 'missing' };
  const diff = daysBetweenYmd(today, dl);
  if (diff === null) return { label: '—', kind: 'unknown' };
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, kind: 'overdue' };
  if (diff === 0) return { label: 'Due today', kind: 'due_today' };
  if (diff === 1) return { label: '1 day left', kind: 'due_soon' };
  if (diff <= 2) return { label: `${diff} days left`, kind: 'due_48h' };
  return { label: `${diff} days left`, kind: 'scheduled' };
}

/** Calculated urgency indicators — never changes stored priority. */
function computeIntelFlags(lead, tz = DEFAULT_TZ) {
  const flags = [];
  const u = urgencyBucket(lead, tz);
  if (u === 'overdue') flags.push('overdue');
  if (u === 'due_today') flags.push('due_24h');
  if (u === 'next_48h') flags.push('due_48h');
  if (u === 'unscheduled') flags.push('missing_deadline');
  if ((lead.client_dependency || 'none').toString().toLowerCase() !== 'none') flags.push('client_blocked');
  const assignEmpty = !(lead.assign || '').toString().trim();
  const pr = (lead.priority_effective || lead.priority || 'medium').toLowerCase();
  if (assignEmpty && (pr === 'critical' || pr === 'high')) flags.push('unassigned_urgent');
  if (assignEmpty && (u === 'overdue' || u === 'due_today')) flags.push('unassigned_urgent');
  return flags;
}

function formatTimeInStage(lead) {
  const t = lead.stage_entered_at;
  if (!t) return { label: '—', days: null };
  const ms = Date.now() - new Date(t).getTime();
  if (Number.isNaN(ms) || ms < 0) return { label: '—', days: null };
  const days = Math.floor(ms / 86400000);
  if (days < 1) return { label: '<1 day', days: 0 };
  if (days === 1) return { label: '1 day', days: 1 };
  return { label: `${days} days`, days };
}

function enrichLeadRow(row, tz = DEFAULT_TZ) {
  const stage = deriveDeliveryStage(row);
  const base = {
    ...row,
    delivery_stage_effective: stage,
    urgency: urgencyBucket(row, tz),
    priority_effective: (row.priority || 'medium').toLowerCase(),
  };
  return {
    ...base,
    time_remaining: formatTimeRemaining(base, tz),
    intel_flags: computeIntelFlags(base, tz),
    time_in_stage: formatTimeInStage(base),
  };
}

module.exports = {
  DELIVERY_STAGES,
  PRIORITIES,
  LEGACY_EXECUTION_STATUSES,
  deriveDeliveryStage,
  isActiveWork,
  urgencyBucket,
  canTransitionStage,
  legacyStatusForStage,
  isLegacyExecutionStatus,
  prioritySortWeight,
  enrichLeadRow,
  formatTimeRemaining,
  computeIntelFlags,
};
