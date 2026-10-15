'use strict';

const { urgencyBucket, deriveDeliveryStage } = require('./freelancingOpsMap');

/** Mutually exclusive primary risk bucket (highest severity wins). */
const RISK_ORDER = [
  'overdue_delivery',
  'blocked',
  'revision_backlog',
  'ready_not_delivered',
  'pending_approval',
  'at_risk',
  'on_track',
];

function classifyDeliveryRisk(lead) {
  const stage = deriveDeliveryStage(lead);
  const urgency = urgencyBucket(lead);
  const blocker = (lead.blocker_reason || '').toString().trim();
  const dep = (lead.client_dependency || 'none').toString().toLowerCase();

  if (urgency === 'overdue' && stage !== 'delivered' && stage !== 'closed') {
    return 'overdue_delivery';
  }
  if (blocker) return 'blocked';
  if (stage === 'revision_required') return 'revision_backlog';
  if (stage === 'ready_for_delivery') return 'ready_not_delivered';
  if (stage === 'client_review' || dep === 'waiting_approval') return 'pending_approval';
  if (urgency === 'due_today' || urgency === 'next_48h') return 'at_risk';
  return 'on_track';
}

function summarizeDeliveryRisk(rows) {
  const counts = {};
  RISK_ORDER.forEach((k) => {
    counts[k] = 0;
  });
  (rows || []).forEach((row) => {
    const bucket = classifyDeliveryRisk(row);
    counts[bucket] = (counts[bucket] || 0) + 1;
  });
  return {
    buckets: counts,
    total_active: (rows || []).length,
    exclusive: true,
    note: 'Each active record is counted once in its highest-severity risk bucket.',
  };
}

module.exports = {
  RISK_ORDER,
  classifyDeliveryRisk,
  summarizeDeliveryRisk,
};
