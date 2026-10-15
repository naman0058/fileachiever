'use strict';

const express = require('express');
const router = express.Router();
const ops = require('../../services/freelancingOpsService');
const deliveryOps = require('../../services/freelancingDeliveryService');
const clientOps = require('../../services/freelancingClientOpsService');
const workloadOps = require('../../services/freelancingWorkloadService');
const financeOps = require('../../services/freelancingFinanceService');
const { DEPENDENCY_STATUSES } = require('../../utils/freelancingClientDeps');
const { DELIVERY_STAGES, PRIORITIES } = require('../../utils/freelancingOpsMap');

function actorFromReq(req) {
  return req.session?.affiliation ? `user:${req.session.affiliation}` : 'ops';
}

router.get('/kpis', async (req, res) => {
  try {
    const kpis = await ops.getExecutiveKpis({ q: req.query.q, agent: req.query.agent });
    res.json({ success: true, kpis });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/badges', async (req, res) => {
  try {
    const badges = await ops.getNavBadgeCounts();
    res.json({ success: true, badges });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.get('/work', async (req, res) => {
  try {
    let myAssign;
    if (req.query.view === 'mine') {
      myAssign = await ops.resolveMyAssignName(req.session?.affiliation);
    }
    const data = await ops.listWork({
      view: req.query.view,
      q: req.query.q,
      agent: req.query.agent,
      priority: req.query.priority,
      delivery_stage: req.query.delivery_stage || req.query.stage,
      page: req.query.page,
      limit: req.query.limit,
      sort: req.query.sort,
      activeOnly: req.query.activeOnly !== '0',
      myAssign,
    });
    res.json({ success: true, ...data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

router.get('/priority/counts', async (req, res) => {
  try {
    const counts = await ops.getPriorityQueueCounts();
    res.json({ success: true, counts });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.get('/priority/attention', async (req, res) => {
  try {
    const perRule = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 6));
    const groups = await ops.getNeedsAttention(perRule);
    res.json({ success: true, groups });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.post('/work/bulk', async (req, res) => {
  try {
    const { ids, patch, reason, forceTransition } = req.body || {};
    const result = await ops.bulkMutateWork(ids, patch || {}, actorFromReq(req), {
      reason,
      forceTransition: forceTransition === true || forceTransition === 'true',
    });
    if (!result.success && result.failed === result.total) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Bulk update failed' });
  }
});

router.get('/work/:id', async (req, res) => {
  try {
    const work = await ops.getWorkById(req.params.id);
    if (!work) return res.status(404).json({ success: false, message: 'Not found' });
    const activity = await ops.getActivityLog(req.params.id);
    res.json({ success: true, work, activity, stages: DELIVERY_STAGES, priorities: PRIORITIES });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

router.patch('/work/:id', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await ops.patchWork(req.params.id, body, actorFromReq(req), {
      expectedVersion: body.expectedVersion ?? body.ops_version,
      reason: body.reason,
      forceTransition: body.forceTransition === true || body.forceTransition === 'true',
      revisionReason: body.revisionReason,
      revisionNotes: body.revisionNotes,
    });
    if (!result.success) {
      const status = result.code === 'CONFLICT' ? 409 : 400;
      return res.status(status).json(result);
    }
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

router.post('/work/:id/field', async (req, res) => {
  const { field, value, expectedVersion, ops_version, reason, forceTransition } = req.body || {};
  try {
    const result = await ops.updateWorkField(req.params.id, field, value, actorFromReq(req), {
      expectedVersion: expectedVersion ?? ops_version,
      reason,
      forceTransition: forceTransition === true || forceTransition === 'true',
    });
    if (!result.success) {
      const status = result.code === 'CONFLICT' ? 409 : 400;
      return res.status(status).json(result);
    }
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

router.post('/work/:id/stage', async (req, res) => {
  try {
    const body = req.body || {};
    const stage = (body.stage || body.delivery_stage || '').toLowerCase();
    if (!stage) return res.status(400).json({ success: false, message: 'stage required' });
    const result = await ops.moveWorkStage(req.params.id, stage, actorFromReq(req), {
      expectedVersion: body.expectedVersion ?? body.ops_version,
      reason: body.reason,
      forceTransition: body.forceTransition === true || body.forceTransition === 'true',
      revisionReason: body.revisionReason,
      revisionNotes: body.revisionNotes,
    });
    if (!result.success) {
      const status = result.code === 'CONFLICT' ? 409 : 400;
      return res.status(status).json(result);
    }
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

router.get('/delivery/kanban', async (req, res) => {
  try {
    const board = await deliveryOps.getKanbanBoard({
      q: req.query.q,
      agent: req.query.agent,
      stage: req.query.stage,
      perColumn: req.query.limit,
    });
    res.json({ success: true, ...board });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

router.get('/delivery/risk', async (req, res) => {
  try {
    const summary = await deliveryOps.getDeliveryRiskSummary({ q: req.query.q, agent: req.query.agent });
    res.json({ success: true, ...summary });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.get('/work/:id/delivery-events', async (req, res) => {
  try {
    const events = await deliveryOps.listDeliveryEvents(req.params.id, req.query.limit);
    res.json({ success: true, events });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.get('/work/:id/revisions', async (req, res) => {
  try {
    const revisions = await deliveryOps.listRevisions(req.params.id);
    res.json({ success: true, revisions });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.post('/work/:id/revisions', async (req, res) => {
  try {
    const result = await deliveryOps.addRevision(req.params.id, req.body || {}, actorFromReq(req));
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

router.get('/work/:id/quality', async (req, res) => {
  try {
    const quality = await deliveryOps.getDeliveryQuality(req.params.id);
    res.json({ success: true, quality });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.patch('/work/:id/quality', async (req, res) => {
  try {
    const result = await deliveryOps.upsertDeliveryQuality(req.params.id, req.body || {}, actorFromReq(req));
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

function financeAuth(req, res) {
  if (!financeOps.canMutateFinance(req.session?.affiliation)) {
    res.status(403).json({ success: false, message: 'Finance mutations require manager permission' });
    return false;
  }
  return true;
}

router.get('/finance/overview', async (req, res) => {
  try {
    const overview = await financeOps.getFinanceOverview({
      from: req.query.from,
      to: req.query.to,
      q: req.query.q,
      client: req.query.client,
      agent: req.query.agent,
    });
    res.json({ success: true, overview });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.get('/finance/receivables', async (req, res) => {
  try {
    const data = await financeOps.listClientReceivables(
      {
        from: req.query.from,
        to: req.query.to,
        q: req.query.q,
        client: req.query.client,
        payment_status: req.query.payment_status,
      },
      req.query.page,
      req.query.limit
    );
    res.json({ success: true, ...data });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.get('/finance/agent-payables', async (req, res) => {
  try {
    const data = await financeOps.listAgentPayables(
      {
        from: req.query.from,
        to: req.query.to,
        agent: req.query.agent,
        q: req.query.q,
        payment_status: req.query.payment_status,
      },
      req.query.page,
      req.query.limit
    );
    res.json({ success: true, ...data });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.get('/finance/reconcile', async (req, res) => {
  try {
    const data = await financeOps.reconcileFinance({
      from: req.query.from,
      to: req.query.to,
      q: req.query.q,
    });
    res.json({ success: true, ...data });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.get('/work/:id/payments', async (req, res) => {
  try {
    const history = await financeOps.listPaymentHistory(req.params.id);
    res.json({ success: true, ...history });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.post('/work/:id/client-payment', async (req, res) => {
  if (!financeAuth(req, res)) return;
  try {
    const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotency_key;
    const result = await financeOps.recordClientPayment(req.params.id, req.body || {}, actorFromReq(req), {
      idempotencyKey,
    });
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

router.post('/work/:id/agent-payment', async (req, res) => {
  if (!financeAuth(req, res)) return;
  try {
    const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotency_key;
    const result = await financeOps.recordAgentPayment(req.params.id, req.body || {}, actorFromReq(req), {
      idempotencyKey,
    });
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

router.get('/pipeline', async (req, res) => {
  try {
    const pipeline = await ops.getPipelineCounts();
    res.json({ success: true, pipeline });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.get('/team-workload', async (req, res) => {
  try {
    const rows = await ops.getTeamWorkload();
    res.json({ success: true, rows });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.get('/workload/dashboard', async (req, res) => {
  try {
    const scope = await workloadOps.listTeamsForUser(req.session?.affiliation);
    let team = req.query.team || 'all';
    if (scope.restrictTeams && scope.myTeam && team === 'all') team = scope.myTeam;
    const data = await workloadOps.getTeamWorkloadDashboard({
      team,
      agent: req.query.agent,
    });
    res.json({ success: true, ...data, scope });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

router.get('/workload/agent/:name', async (req, res) => {
  try {
    const detail = await workloadOps.getAgentWorkloadDetail(decodeURIComponent(req.params.name));
    if (!detail.success) return res.status(404).json(detail);
    res.json(detail);
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.get('/workload/suggest/:workId', async (req, res) => {
  try {
    const data = await workloadOps.getAssignmentSuggestions(req.params.workId);
    if (!data.success) return res.status(404).json(data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.post('/work/:id/assign', async (req, res) => {
  try {
    const { assign, note, expectedVersion, ops_version } = req.body || {};
    const result = await workloadOps.assignWork(req.params.id, assign, actorFromReq(req), {
      note,
      expectedVersion: expectedVersion ?? ops_version,
      reassign: true,
    });
    if (!result.success) {
      const status = result.code === 'CONFLICT' ? 409 : 400;
      return res.status(status).json(result);
    }
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

router.post('/work/bulk-assign', async (req, res) => {
  try {
    const { ids, assign, note } = req.body || {};
    const result = await workloadOps.bulkAssignWork(ids, assign, actorFromReq(req), note);
    if (!result.success && result.failed === result.total) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 1) return res.json({ success: true, groups: [], total: 0 });
    const data = await ops.searchWork(q, req.query.limit);
    res.json({ success: true, ...data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
});

router.get('/client/queue', async (req, res) => {
  try {
    const data = await clientOps.listClientDependencies({
      view: req.query.view,
      q: req.query.q,
      agent: req.query.agent,
      owner: req.query.owner,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json({ success: true, ...data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

router.get('/client/kpis', async (req, res) => {
  try {
    const kpis = await clientOps.getClientDependencyKpis();
    res.json({ success: true, kpis });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.get('/client/reminders', async (req, res) => {
  try {
    const reminders = await clientOps.getFollowUpReminders(req.query.limit);
    res.json({ success: true, ...reminders });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.get('/work/:id/follow-ups', async (req, res) => {
  try {
    const history = await clientOps.listFollowUpHistory(req.params.id, req.query.limit);
    res.json({ success: true, history });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.post('/work/:id/client-dependency', async (req, res) => {
  try {
    const result = await clientOps.openClientDependency(req.params.id, req.body || {}, actorFromReq(req));
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

router.post('/work/:id/follow-up', async (req, res) => {
  try {
    const result = await clientOps.recordFollowUp(req.params.id, req.body || {}, actorFromReq(req));
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

router.post('/work/:id/client-dependency/resolve', async (req, res) => {
  try {
    const result = await clientOps.resolveClientDependency(
      req.params.id,
      actorFromReq(req),
      (req.body && req.body.note) || 'Resolved'
    );
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

router.post('/work/:id/client-dependency/reopen', async (req, res) => {
  try {
    const result = await clientOps.reopenClientDependency(req.params.id, req.body || {}, actorFromReq(req));
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.post('/work/:id/client-dependency/status', async (req, res) => {
  try {
    const status = (req.body && req.body.status) || '';
    const result = await clientOps.transitionDependencyStatus(req.params.id, status, actorFromReq(req), {
      note: req.body && req.body.note,
    });
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

router.get('/meta', async (req, res) => {
  try {
    const [agents, hasOps] = await Promise.all([ops.getAgentsList(), ops.detectOpsColumns()]);
    res.json({
      success: true,
      agents,
      hasOps,
      stages: DELIVERY_STAGES,
      priorities: PRIORITIES,
      clientDependencies: clientOps.CLIENT_DEPENDENCY_CATEGORIES,
      dependencyStatuses: DEPENDENCY_STATUSES,
    });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;
