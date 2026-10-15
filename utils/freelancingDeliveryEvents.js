'use strict';

/** Delivery lifecycle event types (immutable log). */
const DELIVERY_EVENT_TYPES = [
  'work_started',
  'work_internally_completed',
  'submitted_for_review',
  'revision_requested',
  'revision_completed',
  'ready_for_delivery',
  'delivered',
  'accepted_or_closed',
];

/** Map target delivery_stage → event emitted on transition (when stage actually changes). */
function deliveryEventForStage(stage) {
  const m = {
    in_progress: 'work_started',
    internal_review: 'submitted_for_review',
    client_review: 'submitted_for_review',
    revision_required: 'revision_requested',
    ready_for_delivery: 'ready_for_delivery',
    delivered: 'delivered',
    closed: 'accepted_or_closed',
  };
  return m[(stage || '').toLowerCase()] || null;
}

module.exports = {
  DELIVERY_EVENT_TYPES,
  deliveryEventForStage,
};
