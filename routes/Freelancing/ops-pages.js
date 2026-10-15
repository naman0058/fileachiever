'use strict';

const ops = require('../../services/freelancingOpsService');
const deliveryOps = require('../../services/freelancingDeliveryService');
const clientOps = require('../../services/freelancingClientOpsService');
const workloadOps = require('../../services/freelancingWorkloadService');
const financeOps = require('../../services/freelancingFinanceService');
const analyticsOps = require('../../services/freelancingAnalyticsService');
const { CLIENT_DEPENDENCY_CATEGORIES, DEPENDENCY_STATUSES } = require('../../utils/freelancingClientDeps');
const { DELIVERY_STAGES } = require('../../utils/freelancingOpsMap');
const { todayYmdInTz, DEFAULT_TZ } = require('../../utils/freelancingOpsDates');

function toYMD(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseFilters(req) {
  const now = new Date();
  const fromDefault = new Date(now.getFullYear(), now.getMonth(), 1);
  const toDefault = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: toYMD(req.query.from || toYMD(fromDefault)),
    to: toYMD(req.query.to || toYMD(toDefault)),
    agent: (req.query.agent || '').trim(),
    q: (req.query.q || '').trim(),
    quick: (req.query.quick || '').trim(),
    page: Math.max(1, parseInt(req.query.page, 10) || 1),
    view: (req.query.view || req.query.tab || '').trim(),
    limit: Math.min(200, Math.max(10, parseInt(req.query.limit, 10) || 50)),
    sort: (req.query.sort || 'deadline').trim(),
    priority: (req.query.priority || '').trim(),
    delivery_stage: (req.query.stage || req.query.delivery_stage || '').trim(),
  };
}

function priorityQueryString(filters, tab, page) {
  const p = new URLSearchParams();
  const view = tab || filters.view || 'all';
  if (view && view !== 'all') p.set('view', view);
  if (filters.q) p.set('q', filters.q);
  if (filters.agent) p.set('agent', filters.agent);
  if (filters.priority) p.set('priority', filters.priority);
  if (filters.delivery_stage) p.set('stage', filters.delivery_stage);
  if (filters.sort && filters.sort !== 'deadline') p.set('sort', filters.sort);
  if (filters.limit && filters.limit !== 50) p.set('limit', String(filters.limit));
  if (page && page > 1) p.set('page', String(page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function baseLocals(req) {
  const filters = parseFilters(req);
  const [badges, agentsList, hasOps] = await Promise.all([
    ops.getNavBadgeCounts(),
    ops.getAgentsList(),
    ops.detectOpsColumns(),
  ]);
  return {
    filters,
    badges,
    agentsList,
    hasOps,
    today: todayYmdInTz(DEFAULT_TZ),
    stages: DELIVERY_STAGES,
    opsTitle: 'Freelancing Ops',
  };
}

function registerOpsPages(router, folder) {
  router.get('/dashboard', async (req, res) => {
    try {
      const filters = parseFilters(req);
      const finRange = { from: filters.from, to: filters.to, agent: filters.agent, q: filters.q };
      const [kpis, attentionQueue, pipeline, deliveryRisk, workload, followUps, financePortfolio, financeRange, freshness, badges, agentsList, hasOps] =
        await Promise.all([
          ops.getExecutiveKpis(filters),
          ops.getExecutiveAttentionQueue(10),
          ops.getPipelineCounts(),
          analyticsOps.getDeliveryRiskCounts(filters),
          ops.getTeamWorkload({ agent: filters.agent }),
          clientOps.getFollowUpReminders(6),
          financeOps.getFinanceOverview({ agent: filters.agent, q: filters.q }),
          financeOps.getFinanceOverview(finRange),
          analyticsOps.getDataFreshness(),
          ops.getNavBadgeCounts(),
          ops.getAgentsList(),
          ops.detectOpsColumns(),
        ]);

      const workloadRows = (workload || [])
        .filter((w) => w.agent_name !== 'Unassigned' || w.active_tasks > 0)
        .sort((a, b) => (b.overdue_tasks || 0) - (a.overdue_tasks || 0) || (b.active_tasks || 0) - (a.active_tasks || 0))
        .slice(0, 6);

      res.render(`${folder}/ops/dashboard`, {
        filters,
        kpis,
        attentionQueue,
        pipeline,
        deliveryRisk,
        workload: workloadRows,
        followUps,
        financePortfolio,
        financeRange,
        freshness,
        badges,
        agentsList,
        hasOps,
        today: todayYmdInTz(DEFAULT_TZ),
        stages: DELIVERY_STAGES,
        syncMessage: (req.query.sync || req.query.sync_error || '').trim() || null,
        syncIsError: !!(req.query.sync_error || '').trim(),
      });
    } catch (e) {
      console.error(e);
      res.status(500).send('Dashboard error');
    }
  });

  router.get('/delivery', async (req, res) => {
    try {
      const filters = parseFilters(req);
      let mode = (req.query.mode || 'kanban').toLowerCase();
      if (!['kanban', 'table', 'schedule'].includes(mode)) mode = 'kanban';
      const stage = (req.query.stage || '').trim();

      const locals = await baseLocals(req);
      const [pipeline, riskSummary] = await Promise.all([
        ops.getPipelineCounts(),
        deliveryOps.getDeliveryRiskSummary({ q: filters.q, agent: filters.agent }),
      ]);

      let list = null;
      let kanbanBoard = null;

      if (mode === 'kanban') {
        kanbanBoard = await deliveryOps.getKanbanBoard({
          q: filters.q,
          agent: filters.agent,
          stage: stage || undefined,
          perColumn: 40,
        });
      } else if (mode === 'table') {
        list = await ops.listWork({
          delivery_stage: stage || undefined,
          q: filters.q,
          agent: filters.agent,
          page: filters.page,
          limit: filters.limit,
          sort: filters.sort || 'stage',
        });
      } else {
        list = await ops.listWork({
          q: filters.q,
          agent: filters.agent,
          page: filters.page,
          limit: filters.limit,
          sort: 'deadline',
        });
      }

      const deliveryReturnTo = encodeURIComponent(
        `/freelancing/delivery?mode=${mode}&stage=${encodeURIComponent(stage)}&q=${encodeURIComponent(filters.q || '')}&agent=${encodeURIComponent(filters.agent || '')}`
      );

      res.render(`${folder}/ops/delivery`, {
        ...locals,
        filters,
        mode,
        pipeline,
        list,
        kanbanBoard,
        stage,
        riskSummary,
        deliveryReturnTo,
        currentPath: 'delivery',
        tab: stage,
      });
    } catch (e) {
      console.error(e);
      res.status(500).send('Delivery page error');
    }
  });

  router.get('/client-pending', async (req, res) => {
    try {
      const filters = parseFilters(req);
      const clientView = (req.query.view || 'open').trim();
      const [list, kpis, reminders] = await Promise.all([
        clientOps.listClientDependencies({
          view: clientView,
          q: filters.q,
          agent: filters.agent,
          page: filters.page,
          limit: filters.limit,
        }),
        clientOps.getClientDependencyKpis(),
        clientOps.getFollowUpReminders(8),
      ]);
      res.render(`${folder}/ops/client-pending`, {
        ...(await baseLocals(req)),
        filters,
        list,
        clientView,
        clientKpis: kpis,
        reminders,
        dependencyCategories: CLIENT_DEPENDENCY_CATEGORIES,
        dependencyStatuses: DEPENDENCY_STATUSES,
      });
    } catch (e) {
      console.error(e);
      res.status(500).send('Client pending error');
    }
  });

  router.get('/team-workload', async (req, res) => {
    try {
      const filters = parseFilters(req);
      const agent = filters.agent;
      const team = (req.query.team || 'all').trim();
      const layout = (req.query.layout || 'cards').toLowerCase();
      const scope = await workloadOps.listTeamsForUser(req.session?.affiliation);
      let teamFilter = team;
      if (scope.restrictTeams && scope.myTeam && teamFilter === 'all') teamFilter = scope.myTeam;

      const [dashboard, agentDetail] = await Promise.all([
        workloadOps.getTeamWorkloadDashboard({ team: teamFilter, agent: agent || undefined }),
        agent ? workloadOps.getAgentWorkloadDetail(agent) : Promise.resolve(null),
      ]);

      res.render(`${folder}/ops/team-workload`, {
        ...(await baseLocals(req)),
        filters,
        teamFilter,
        layout,
        dashboard,
        agentDetail: agentDetail && agentDetail.success ? agentDetail : null,
        scope,
        effortModel: dashboard.effort_model,
      });
    } catch (e) {
      console.error(e);
      res.status(500).send('Team workload error');
    }
  });

  router.get('/unassigned', async (req, res) => {
    try {
      const filters = parseFilters(req);
      const [activeList, allTimeCount, dashboard] = await Promise.all([
        ops.listWork({
          view: 'unassigned',
          q: filters.q,
          page: filters.page,
          limit: filters.limit,
          activeOnly: true,
          sort: 'deadline',
        }),
        ops.listWork({ view: 'unassigned', page: 1, limit: 1, activeOnly: false }),
        workloadOps.getTeamWorkloadDashboard({}),
      ]);
      const urgent = activeList.items.filter(
        (it) => it.urgency === 'overdue' || it.urgency === 'due_today' || it.priority_effective === 'critical'
      );

      res.render(`${folder}/ops/unassigned`, {
        ...(await baseLocals(req)),
        filters,
        list: activeList,
        assignCandidates: dashboard.agents,
        metrics: {
          active_unassigned: activeList.total,
          all_time_unassigned: allTimeCount.total,
          urgent_unassigned: urgent.length,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).send('Unassigned error');
    }
  });

  router.get('/deadlines', async (req, res) => {
    try {
      const filters = parseFilters(req);
      const list = await ops.listWork({
        q: filters.q,
        agent: filters.agent,
        page: filters.page,
        limit: Math.min(200, filters.limit * 2),
        sort: 'deadline',
      });
      res.render(`${folder}/ops/deadlines`, { ...(await baseLocals(req)), filters, list });
    } catch (e) {
      console.error(e);
      res.status(500).send('Deadlines error');
    }
  });

  router.get('/finance', async (req, res) => {
    try {
      const filters = parseFilters(req);
      const finFilters = {
        from: filters.from,
        to: filters.to,
        q: filters.q,
        client: (req.query.client || '').trim(),
        agent: filters.agent,
        payment_status: (req.query.payment_status || '').trim(),
      };
      const tab = (req.query.tab || 'overview').trim();
      const [overview, receivables, agentPayables, reconcile, canMutate] = await Promise.all([
        financeOps.getFinanceOverview(finFilters),
        tab === 'client' || tab === 'overview'
          ? financeOps.listClientReceivables(finFilters, filters.page, filters.limit)
          : Promise.resolve(null),
        tab === 'agent' || tab === 'overview'
          ? financeOps.listAgentPayables(finFilters, filters.page, filters.limit)
          : Promise.resolve(null),
        tab === 'reconcile' ? financeOps.reconcileFinance(finFilters) : Promise.resolve(null),
        Promise.resolve(financeOps.canMutateFinance(req.session?.affiliation)),
      ]);
      res.render(`${folder}/ops/finance`, {
        ...(await baseLocals(req)),
        filters,
        finFilters,
        tab,
        overview,
        receivables,
        agentPayables,
        reconcile,
        canMutateFinance: canMutate,
      });
    } catch (e) {
      console.error(e);
      res.status(500).send('Finance error');
    }
  });

  router.get('/analytics', async (req, res) => {
    try {
      const filters = parseFilters(req);
      filters.trend_days = Math.min(31, Math.max(7, parseInt(req.query.trend_days, 10) || 14));
      const bundle = await analyticsOps.getAnalyticsBundle(filters);
      const trendEmpty = !(bundle.deliveryTrend || []).some(
        (d) => d.due_total > 0 || d.overdue > 0 || d.done > 0
      );
      res.render(`${folder}/ops/analytics`, {
        ...(await baseLocals(req)),
        filters,
        analytics: bundle,
        trendEmpty,
      });
    } catch (e) {
      console.error(e);
      res.status(500).send('Analytics error');
    }
  });

  router.get('/analytics/export', async (req, res) => {
    try {
      const filters = parseFilters(req);
      const type = (req.query.type || 'financial').trim();
      const csv = await analyticsOps.exportCsv(type, filters);
      const safe = type.replace(/[^a-z0-9_-]/gi, '') || 'export';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="freelancing-${safe}-${filters.from}-${filters.to}.csv"`);
      res.send('\uFEFF' + csv);
    } catch (e) {
      console.error(e);
      res.status(500).send('Export error');
    }
  });

  router.get('/work/:id', async (req, res) => {
    try {
      const work = await ops.getWorkById(req.params.id);
      if (!work) return res.status(404).send('Work not found');
      const activity = await ops.getActivityLog(req.params.id);
      const [deliveryEvents, revisions, followUpHistory, paymentHistory] = await Promise.all([
        deliveryOps.listDeliveryEvents(req.params.id, 30),
        deliveryOps.listRevisions(req.params.id),
        clientOps.listFollowUpHistory(req.params.id, 40),
        financeOps.listPaymentHistory(req.params.id),
      ]);
      const { DELIVERY_STAGES } = require('../../utils/freelancingOpsMap');
      res.render(`${folder}/ops/work-detail`, {
        ...(await baseLocals(req)),
        work,
        activity,
        deliveryEvents,
        revisions,
        returnTo: (req.query.returnTo || '').trim(),
        tab: (req.query.tab || 'overview').trim(),
        stages: DELIVERY_STAGES,
        clientDependencies: CLIENT_DEPENDENCY_CATEGORIES,
        dependencyStatuses: DEPENDENCY_STATUSES,
        followUpHistory,
        paymentHistory,
        canMutateFinance: financeOps.canMutateFinance(req.session?.affiliation),
      });
    } catch (e) {
      console.error(e);
      res.status(500).send('Work detail error');
    }
  });

  router.get('/priority', async (req, res) => {
    try {
      const filters = parseFilters(req);
      let view = filters.view || filters.quick || 'all';
      if (filters.quick === 'overdue') view = 'overdue';
      if (filters.quick === 'today') view = 'today';
      if (filters.quick === 'next48') view = 'next48';
      if (filters.quick === 'critical') view = 'critical';

      const myAssign =
        view === 'mine' ? await ops.resolveMyAssignName(req.session?.affiliation) : null;

      const [list, queueCounts, needsAttention] = await Promise.all([
        ops.listWork({
          view: view === 'all' ? undefined : view,
          q: filters.q,
          agent: filters.agent,
          priority: filters.priority || undefined,
          delivery_stage: filters.delivery_stage || undefined,
          page: filters.page,
          limit: filters.limit,
          sort: filters.sort,
          myAssign: myAssign || undefined,
          activeOnly: view === 'delivered_pending_closure' ? false : true,
        }),
        ops.getPriorityQueueCounts(),
        view === 'attention' ? ops.getNeedsAttention(8) : Promise.resolve(null),
      ]);

      const returnTo = encodeURIComponent(`/freelancing/priority${priorityQueryString(filters, view, filters.page)}`);

      res.render(`${folder}/ops/priority`, {
        ...(await baseLocals(req)),
        filters,
        list,
        tab: view,
        queueCounts,
        needsAttention,
        myAssign,
        returnTo,
        filterClearPath: `/freelancing/priority${view && view !== 'all' ? `?view=${encodeURIComponent(view)}` : ''}`,
        priorityQueryString: (tab, page) => priorityQueryString(filters, tab || view, page || filters.page),
      });
    } catch (e) {
      console.error(e);
      res.status(500).send('Priority error');
    }
  });
}

module.exports = registerOpsPages;
