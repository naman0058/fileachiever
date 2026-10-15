'use strict';

const { todayYmdInTz, daysBetweenYmd, DEFAULT_TZ } = require('./freelancingOpsDates');

const CLIENT_DEPENDENCY_CATEGORIES = [
  'none',
  'waiting_files',
  'waiting_project_requirements',
  'waiting_clarification',
  'waiting_feedback',
  'waiting_approval',
  'revision_clarification',
  'other',
];

const CLIENT_DEPENDENCY_LABELS = {
  none: 'None',
  waiting_files: 'Waiting for files',
  waiting_project_requirements: 'Waiting for project requirements',
  waiting_info: 'Waiting for project requirements',
  waiting_clarification: 'Waiting for clarification',
  waiting_feedback: 'Waiting for feedback',
  waiting_approval: 'Waiting for approval',
  revision_clarification: 'Revision clarification',
  other: 'Other client dependency',
};

const DEPENDENCY_STATUSES = ['open', 'follow_up_scheduled', 'awaiting_response', 'resolved'];

const STATUS_TRANSITIONS = {
  open: ['follow_up_scheduled', 'awaiting_response', 'resolved'],
  follow_up_scheduled: ['awaiting_response', 'follow_up_scheduled', 'resolved', 'open'],
  awaiting_response: ['follow_up_scheduled', 'resolved', 'open'],
  resolved: ['open'],
};

function normalizeDependencyType(v) {
  const s = (v || 'none').toString().trim().toLowerCase();
  if (s === 'waiting_info') return 'waiting_project_requirements';
  return s;
}

function dependencyLabel(v) {
  return CLIENT_DEPENDENCY_LABELS[normalizeDependencyType(v)] || v || '—';
}

function canTransitionDependencyStatus(from, to) {
  const f = (from || 'open').toLowerCase();
  const t = (to || '').toLowerCase();
  if (!t || f === t) return true;
  const allowed = STATUS_TRANSITIONS[f];
  if (!allowed) return f === 'resolved' && t === 'open';
  return allowed.includes(t);
}

function isOpenClientDependency(lead) {
  const dep = normalizeDependencyType(lead.client_dependency);
  if (dep === 'none') return false;
  const st = (lead.client_dependency_status || 'open').toLowerCase();
  return st !== 'resolved';
}

function waitingSinceYmd(lead) {
  const t = lead.client_dependency_opened_at || lead.created_at;
  if (!t) return null;
  return String(t).slice(0, 10);
}

function enrichClientDependencyFields(lead, tz = DEFAULT_TZ) {
  const today = todayYmdInTz(tz);
  const since = waitingSinceYmd(lead);
  const daysWaiting =
    since && isOpenClientDependency(lead) ? daysBetweenYmd(since, today) : null;
  const followDue = lead.follow_up_due ? String(lead.follow_up_due).slice(0, 10) : null;
  let followUpState = 'none';
  if (followDue && isOpenClientDependency(lead)) {
    const diff = daysBetweenYmd(today, followDue);
    if (diff < 0) followUpState = 'overdue';
    else if (diff === 0) followUpState = 'due_today';
    else followUpState = 'scheduled';
  }
  return {
    client_dependency_normalized: normalizeDependencyType(lead.client_dependency),
    client_dependency_label: dependencyLabel(lead.client_dependency),
    client_dependency_status_effective: (lead.client_dependency_status || (isOpenClientDependency(lead) ? 'open' : 'resolved')).toLowerCase(),
    waiting_since: since,
    days_waiting: daysWaiting,
    follow_up_state: followUpState,
    is_client_dependency_open: isOpenClientDependency(lead),
  };
}

module.exports = {
  CLIENT_DEPENDENCY_CATEGORIES,
  CLIENT_DEPENDENCY_LABELS,
  DEPENDENCY_STATUSES,
  normalizeDependencyType,
  dependencyLabel,
  canTransitionDependencyStatus,
  isOpenClientDependency,
  enrichClientDependencyFields,
};
