/**
 * Project Report Sales — Team Member Portal
 * Role: report_sales | Isolated from Freelancing Sales / PRM / PRC
 */
const express = require('express');
const path = require('path');
const router = express.Router();
const pool = require('./pool');
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);
const { buildSessionUser, enforceCrmSession, assignPortalUser, redirectAfterPortalLogin, findCrmUserByCredentials } = require('../utils/crmSession');
const prs = require('../services/projectReportSalesService');
const {
  handleProjectReportWordDownload,
  loadPrcLibraryForExport
} = require('./project-report-creator');
const { buildFullReportItems, filterSynopsisItems, filterPredefinedReportItems } = require('./prc-build-full-report-items');

router.use(express.static(path.join(__dirname, '../public/report-sales'), { maxAge: '1d' }));

const PLAN_META = {
  synopsis: { key: 'synopsis', title: 'Synopsis', hint: 'Instant — assist / regenerate' },
  report: { key: 'report', title: 'Pre Defined Report', hint: 'Instant — assist / regenerate' },
  customized: { key: 'customized', title: 'Customized Report', hint: 'Claim · pipeline · deliver' },
  originality: { key: 'originality', title: 'Originality Verified', hint: 'Claim · pipeline · deliver' }
};

const VALID_STATUS = [
  'pending',
  'claimed',
  'in_progress',
  'waiting_customer',
  'ready_to_deliver',
  'delivered',
  'cancelled'
];

function ymNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthsList(limit = 6) {
  const arr = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < limit; i++) {
    arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return arr;
}

function getUser(req) {
  return req.user || req.session?.user || null;
}

async function requireReportSales(req, res, next) {
  const result = await enforceCrmSession(req, res, '/report-sales/login');
  if (!result) return;
  const role = String(result.role || '').trim().toLowerCase();
  if (role !== 'report_sales') return res.redirect('/report-sales/login');
  req._user = result;
  return next();
}

function decorateRows(rows) {
  return (rows || []).map((r) => ({
    ...r,
    delay: prs.delayBucket(r),
    instant: prs.isInstantPlan(r.plan)
  }));
}

// ——— Auth ———
router.get('/login', (req, res) => {
  if (getUser(req) && String(getUser(req).role || '').toLowerCase() === 'report_sales') {
    return res.redirect('/report-sales');
  }
  res.render('report-sales/login', { error: '', msg: req.query.msg || '' });
});

router.post('/login', async (req, res) => {
  try {
    const email = (req.body.email || '').toString().trim();
    const password = (req.body.password || '').toString().trim();
    if (!email || !password) {
      return res.render('report-sales/login', { error: 'Email and password required.', msg: '' });
    }
    const r = await findCrmUserByCredentials(email, password);
    if (!r) {
      return res.render('report-sales/login', { error: 'Invalid credentials.', msg: '' });
    }
    const role = String(r.role || '').trim().toLowerCase();
    if (role === 'report_sales_admin') {
      return res.render('report-sales/login', {
        error: 'This login is for Report Sales Team. Use the Admin portal.',
        msg: '',
        adminLink: true
      });
    }
    if (role !== 'report_sales') {
      return res.render('report-sales/login', {
        error: 'This portal is for Report Sales Team only.',
        msg: ''
      });
    }
    if (!r.is_active) {
      return res.render('report-sales/login', { error: 'Account disabled.', msg: '' });
    }
    assignPortalUser(req, r);
    return redirectAfterPortalLogin(res, '/report-sales');
  } catch (e) {
    console.error('report-sales login:', e);
    return res.render('report-sales/login', { error: 'Server error.', msg: '' });
  }
});

router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/report-sales/login');
});

// ——— Dashboard home → synopsis by default ———
router.get('/', requireReportSales, (req, res) => {
  res.redirect('/report-sales/queue/customized');
});

async function renderQueue(req, res, planKey) {
  try {
    await prs.ensureSchema();
    const u = req._user;
    const plan = PLAN_META[planKey] ? planKey : 'synopsis';
    const tab = ['pending', 'pipeline', 'delayed', 'all'].includes(req.query.tab)
      ? req.query.tab
      : 'all';
    const q = (req.query.q || '').toString().trim();

    const mineWhere = ['p.assigned_to = ?', 'p.plan = ?'];
    const mineParams = [u.id, plan];
    // Plan queues = active work only (delivered is under /delivered)
    if (tab === 'pending') mineWhere.push(`p.status = 'pending'`);
    else if (tab === 'pipeline') {
      mineWhere.push(
        `p.status IN ('claimed','in_progress','waiting_customer','ready_to_deliver')`
      );
    } else if (tab === 'delayed') {
      mineWhere.push(
        `p.status IN ('pending','claimed','in_progress','waiting_customer','ready_to_deliver')`
      );
      mineWhere.push(`p.sla_due_at IS NOT NULL AND p.sla_due_at < NOW()`);
    } else {
      mineWhere.push(
        `p.status IN ('pending','claimed','in_progress','waiting_customer','ready_to_deliver')`
      );
    }
    if (q) {
      mineWhere.push(
        `(p.customer_name LIKE ? OR p.customer_number LIKE ? OR p.fm_order_id LIKE ? OR p.product_name LIKE ? OR p.customer_email LIKE ?)`
      );
      const like = `%${q.replace(/%/g, '\\%')}%`;
      mineParams.push(like, like, like, like, like);
    }

    const rows = decorateRows(
      await queryAsync(
        `SELECT p.* FROM prs_orders p
         WHERE ${mineWhere.join(' AND ')}
         ORDER BY
           CASE
             WHEN p.status IN ('claimed','in_progress','ready_to_deliver') THEN 0
             WHEN p.status = 'waiting_customer' THEN 1
             WHEN p.status = 'pending' THEN 2
             ELSE 3
           END,
           CASE WHEN p.sla_due_at IS NULL THEN 1 ELSE 0 END,
           p.sla_due_at ASC,
           p.created_at ASC
         LIMIT 300`,
        mineParams
      )
    );

    let unassigned = [];
    if (tab === 'all' || tab === 'pending' || tab === 'pipeline') {
      const uw = [
        'p.assigned_to IS NULL',
        'p.plan = ?',
        `p.status IN ('pending','claimed','in_progress','waiting_customer','ready_to_deliver')`
      ];
      const up = [plan];
      if (q) {
        uw.push(
          `(p.customer_name LIKE ? OR p.customer_number LIKE ? OR p.fm_order_id LIKE ? OR p.product_name LIKE ?)`
        );
        const like = `%${q.replace(/%/g, '\\%')}%`;
        up.push(like, like, like, like);
      }
      unassigned = decorateRows(
        await queryAsync(
          `SELECT p.* FROM prs_orders p
           WHERE ${uw.join(' AND ')}
           ORDER BY p.created_at ASC
           LIMIT 50`,
          up
        )
      );
    }

    const perf = await prs.getMemberPerformance(u.id, ymNow());
    const planCounts = await queryAsync(
      `SELECT plan,
         SUM(CASE WHEN assigned_to IS NULL AND status IN ('pending','claimed','in_progress','waiting_customer','ready_to_deliver') THEN 1 ELSE 0 END) AS pool_c,
         SUM(CASE WHEN assigned_to = ? AND status IN ('pending','claimed','in_progress','waiting_customer','ready_to_deliver') THEN 1 ELSE 0 END) AS mine_c
       FROM prs_orders
       GROUP BY plan`,
      [u.id]
    );
    const countsByPlan = {};
    (planCounts || []).forEach((r) => {
      countsByPlan[r.plan] = { pool: Number(r.pool_c) || 0, mine: Number(r.mine_c) || 0 };
    });

    return res.render('report-sales/queue', {
      pageTitle: PLAN_META[plan].title,
      active: plan,
      user: u,
      planMeta: PLAN_META,
      plan,
      rows,
      unassigned,
      filters: { tab, q },
      stats: perf,
      countsByPlan,
      isInstant: prs.isInstantPlan(plan)
    });
  } catch (e) {
    console.error('report-sales queue:', e);
    res.status(500).send('Failed to load queue.');
  }
}

router.get('/queue/:plan', requireReportSales, (req, res) => {
  const plan = String(req.params.plan || '').toLowerCase();
  if (!PLAN_META[plan]) return res.redirect('/report-sales/queue/customized');
  return renderQueue(req, res, plan);
});

router.get('/delivered', requireReportSales, async (req, res) => {
  try {
    await prs.ensureSchema();
    const u = req._user;
    const plan = PLAN_META[req.query.plan] ? req.query.plan : '';
    const where = [`p.status = 'delivered'`];
    const params = [];
    if (plan) {
      where.push('p.plan = ?');
      params.push(plan);
    }
    const rows = decorateRows(
      await queryAsync(
        `SELECT p.* FROM prs_orders p
         WHERE ${where.join(' AND ')}
         ORDER BY COALESCE(p.delivered_at, p.updated_at, p.created_at) DESC
         LIMIT 100`,
        params
      )
    );
    const planCounts = await queryAsync(
      `SELECT plan,
         SUM(CASE WHEN assigned_to IS NULL AND status IN ('pending','claimed','in_progress','waiting_customer','ready_to_deliver') THEN 1 ELSE 0 END) AS pool_c,
         SUM(CASE WHEN assigned_to = ? AND status IN ('pending','claimed','in_progress','waiting_customer','ready_to_deliver') THEN 1 ELSE 0 END) AS mine_c
       FROM prs_orders GROUP BY plan`,
      [u.id]
    );
    const countsByPlan = {};
    (planCounts || []).forEach((r) => {
      countsByPlan[r.plan] = { pool: Number(r.pool_c) || 0, mine: Number(r.mine_c) || 0 };
    });
    return res.render('report-sales/delivered', {
      pageTitle: 'Delivered',
      active: 'delivered',
      user: u,
      planMeta: PLAN_META,
      rows,
      filters: { plan },
      countsByPlan,
      stats: await prs.getMemberPerformance(u.id, ymNow())
    });
  } catch (e) {
    console.error('report-sales delivered:', e);
    res.status(500).send('Failed to load delivered.');
  }
});

router.get('/reports', requireReportSales, async (req, res) => {
  try {
    await prs.ensureSchema();
    const u = req._user;
    const nameQ = (req.query.name || '').toString().trim();
    const phoneQ = (req.query.phone || '').toString().trim();
    const searched = !!(nameQ || String(phoneQ).replace(/\D/g, ''));
    const rows = searched
      ? await prs.lookupPaidOrders({ name: nameQ, phone: phoneQ, limit: 100 })
      : [];
    const planCounts = await queryAsync(
      `SELECT plan,
         SUM(CASE WHEN assigned_to IS NULL AND status IN ('pending','claimed','in_progress','waiting_customer','ready_to_deliver') THEN 1 ELSE 0 END) AS pool_c,
         SUM(CASE WHEN assigned_to = ? AND status IN ('pending','claimed','in_progress','waiting_customer','ready_to_deliver') THEN 1 ELSE 0 END) AS mine_c
       FROM prs_orders GROUP BY plan`,
      [u.id]
    );
    const countsByPlan = {};
    (planCounts || []).forEach((r) => {
      countsByPlan[r.plan] = { pool: Number(r.pool_c) || 0, mine: Number(r.mine_c) || 0 };
    });
    return res.render('report-sales/reports', {
      pageTitle: 'Order lookup',
      active: 'reports',
      user: u,
      planMeta: PLAN_META,
      rows,
      filters: { name: nameQ, phone: phoneQ },
      searched,
      countsByPlan
    });
  } catch (e) {
    console.error('report-sales reports:', e);
    res.status(500).send('Failed to load lookup.');
  }
});

router.get('/source-orders', requireReportSales, async (req, res) => {
  try {
    await prs.ensureSchema();
    const u = req._user;
    const rows = await prs.listSourceOrders(100);
    const planCounts = await queryAsync(
      `SELECT plan,
         SUM(CASE WHEN assigned_to IS NULL AND status IN ('pending','claimed','in_progress','waiting_customer','ready_to_deliver') THEN 1 ELSE 0 END) AS pool_c,
         SUM(CASE WHEN assigned_to = ? AND status IN ('pending','claimed','in_progress','waiting_customer','ready_to_deliver') THEN 1 ELSE 0 END) AS mine_c
       FROM prs_orders GROUP BY plan`,
      [u.id]
    );
    const countsByPlan = {};
    (planCounts || []).forEach((r) => {
      countsByPlan[r.plan] = { pool: Number(r.pool_c) || 0, mine: Number(r.mine_c) || 0 };
    });
    return res.render('report-sales/source-orders', {
      pageTitle: 'Source code orders',
      active: 'source',
      user: u,
      planMeta: PLAN_META,
      rows,
      countsByPlan
    });
  } catch (e) {
    console.error('report-sales source-orders:', e);
    res.status(500).send('Failed to load source orders.');
  }
});

router.get('/performance', requireReportSales, async (req, res) => {
  try {
    await prs.ensureSchema();
    const selectedMonth = /^\d{4}-\d{2}$/.test(String(req.query.month || ''))
      ? String(req.query.month)
      : ymNow();
    const perf = await prs.getMemberPerformance(req._user.id, selectedMonth);
    const planCounts = await queryAsync(
      `SELECT plan,
         SUM(CASE WHEN assigned_to IS NULL AND status IN ('pending','claimed','in_progress','waiting_customer','ready_to_deliver') THEN 1 ELSE 0 END) AS pool_c,
         SUM(CASE WHEN assigned_to = ? AND status IN ('pending','claimed','in_progress','waiting_customer','ready_to_deliver') THEN 1 ELSE 0 END) AS mine_c
       FROM prs_orders GROUP BY plan`,
      [req._user.id]
    );
    const countsByPlan = {};
    (planCounts || []).forEach((r) => {
      countsByPlan[r.plan] = { pool: Number(r.pool_c) || 0, mine: Number(r.mine_c) || 0 };
    });
    return res.render('report-sales/performance', {
      pageTitle: 'My Performance',
      active: 'performance',
      user: req._user,
      planMeta: PLAN_META,
      months: monthsList(6),
      selectedMonth,
      stats: perf,
      countsByPlan
    });
  } catch (e) {
    console.error('report-sales performance:', e);
    res.status(500).send('Failed to load performance.');
  }
});

// ——— APIs ———
router.post('/api/:id/claim', requireReportSales, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    const rows = await queryAsync(`SELECT id, assigned_to, status FROM prs_orders WHERE id = ? LIMIT 1`, [
      id
    ]);
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Not found' });
    if (rows[0].assigned_to) return res.status(400).json({ ok: false, message: 'Already assigned' });
    await queryAsync(
      `UPDATE prs_orders
       SET assigned_to = ?,
           status = IF(status='pending','claimed',status),
           claimed_at = COALESCE(claimed_at, NOW()),
           updated_at = NOW()
       WHERE id = ? AND assigned_to IS NULL`,
      [req._user.id, id]
    );
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

router.post('/api/:id/status', requireReportSales, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const status = (req.body.status || '').toString();
    const notes = (req.body.notes || '').toString().trim() || null;
    const deliveryNote = (req.body.delivery_note || '').toString().trim() || null;
    const deliveryLink = (req.body.delivery_link || '').toString().trim() || null;
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    if (!VALID_STATUS.includes(status)) {
      return res.status(400).json({ ok: false, message: 'Invalid status' });
    }
    const rows = await queryAsync(`SELECT id, assigned_to FROM prs_orders WHERE id = ? LIMIT 1`, [id]);
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Not found' });
    if (rows[0].assigned_to !== req._user.id) {
      return res.status(403).json({ ok: false, message: 'Not assigned to you' });
    }
    if (status === 'delivered') {
      await queryAsync(
        `UPDATE prs_orders SET
           status = ?,
           notes = COALESCE(?, notes),
           delivery_note = COALESCE(?, delivery_note),
           delivery_link = COALESCE(?, delivery_link),
           delivered_at = NOW(),
           updated_at = NOW()
         WHERE id = ?`,
        [status, notes, deliveryNote, deliveryLink, id]
      );
    } else {
      await queryAsync(
        `UPDATE prs_orders SET
           status = ?,
           notes = COALESCE(?, notes),
           delivery_note = COALESCE(?, delivery_note),
           delivery_link = COALESCE(?, delivery_link),
           updated_at = NOW()
         WHERE id = ?`,
        [status, notes, deliveryNote, deliveryLink, id]
      );
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

/** Staff regenerate Word for synopsis / predefined */
router.get('/api/:id/download-report', requireReportSales, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).send('Invalid id');
    const rows = await queryAsync(`SELECT * FROM prs_orders WHERE id = ? LIMIT 1`, [id]);
    if (!rows.length) return res.status(404).send('Not found');
    const ticket = rows[0];
    if (ticket.assigned_to && ticket.assigned_to !== req._user.id) {
      // Instant assist: any team member may regenerate Word for delivered synopsis/predefined
      if (!(prs.isInstantPlan(ticket.plan) && String(ticket.status) === 'delivered')) {
        return res.status(403).send('Not assigned to you');
      }
    }
    if (!prs.isInstantPlan(ticket.plan)) {
      return res.status(400).send('Download assist is only for Synopsis / Pre Defined plans');
    }
    const scId = parseInt(ticket.source_code_id, 10);
    if (!Number.isFinite(scId)) return res.status(400).send('Missing project id');

    const scRows = await queryAsync('SELECT id, name FROM source_code WHERE id=? LIMIT 1', [scId]);
    if (!scRows.length) return res.status(404).send('Project not found');

    const lib = await loadPrcLibraryForExport(scId);
    let items = buildFullReportItems({
      sections: lib.sectionsWithSub,
      dbScreenshots: lib.dbScreenshots,
      screenshots: lib.screenshots,
      diagrams: lib.diagramsList
    });
    if (ticket.plan === 'synopsis') items = filterSynopsisItems(items);
    else if (ticket.plan === 'report') items = filterPredefinedReportItems(items);
    if (!items.length) return res.status(400).send('Report content not ready');

    const sourceCodeName =
      (scRows[0].name || 'Report').toString().trim() +
      (ticket.plan === 'synopsis' ? ' Synopsis' : ' Report');

    await queryAsync(
      `UPDATE prs_orders SET notes = CONCAT(COALESCE(notes,''), IF(notes IS NULL OR notes='', '', '\n'), ?), updated_at = NOW() WHERE id = ?`,
      [
        `[staff] Regenerated ${String(req.query.format || 'docx').toLowerCase() === 'pdf' ? 'PDF' : 'Word'} by ${req._user.name || req._user.id} at ${new Date().toISOString()}`,
        id
      ]
    );

    const prevBody = req.body;
    try {
      const fmt = String(req.query.format || 'docx').toLowerCase() === 'pdf' ? 'pdf' : 'docx';
      req.body = { sourceCodeId: scId, sourceCodeName, items, format: fmt };
      await handleProjectReportWordDownload(req, res);
    } finally {
      req.body = prevBody;
    }
  } catch (e) {
    console.error('report-sales download:', e);
    if (!res.headersSent) res.status(500).send('Could not generate report file');
  }
});

module.exports = router;
