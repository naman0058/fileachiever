/**
 * Project Report Sales — Admin Portal
 * Role: report_sales_admin | Fully separate from Freelancing Sales / PRM / PRC
 */
const express = require('express');
const path = require('path');
const router = express.Router();
const pool = require('./pool');
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);
const {
  buildSessionUser,
  enforceCrmSession,
  invalidateUserSessions,
  assignPortalUser,
  redirectAfterPortalLogin,
  findCrmUserByCredentials
} = require('../utils/crmSession');
const prs = require('../services/projectReportSalesService');

router.use(express.static(path.join(__dirname, '../public/report-sales-admin'), { maxAge: '1d' }));

const PLAN_META = {
  synopsis: 'Synopsis',
  report: 'Pre Defined',
  customized: 'Customized',
  originality: 'Originality'
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

async function requireAdmin(req, res, next) {
  const result = await enforceCrmSession(req, res, '/report-sales-admin/login');
  if (!result) return;
  const role = String(result.role || '').trim().toLowerCase();
  if (role !== 'report_sales_admin') return res.redirect('/report-sales-admin/login');
  req._user = result;
  return next();
}

function decorate(rows) {
  return (rows || []).map((r) => ({ ...r, delay: prs.delayBucket(r) }));
}

// ——— Auth ———
router.get('/login', (req, res) => {
  if (getUser(req) && String(getUser(req).role || '').toLowerCase() === 'report_sales_admin') {
    return res.redirect('/report-sales-admin');
  }
  res.render('report-sales-admin/login', { error: '', msg: req.query.msg || '' });
});

router.post('/login', async (req, res) => {
  try {
    const email = (req.body.email || '').toString().trim();
    const password = (req.body.password || '').toString().trim();
    if (!email || !password) {
      return res.render('report-sales-admin/login', { error: 'Email and password required.', msg: '' });
    }
    const r = await findCrmUserByCredentials(email, password);
    if (!r) {
      return res.render('report-sales-admin/login', { error: 'Invalid credentials.', msg: '' });
    }
    const role = String(r.role || '').trim().toLowerCase();
    if (role === 'report_sales') {
      return res.render('report-sales-admin/login', {
        error: 'Team accounts use the Report Sales Team portal.',
        msg: '',
        teamLink: true
      });
    }
    if (role !== 'report_sales_admin') {
      return res.render('report-sales-admin/login', {
        error: 'This portal is for Report Sales Admin only.',
        msg: ''
      });
    }
    if (!r.is_active) {
      return res.render('report-sales-admin/login', { error: 'Account disabled.', msg: '' });
    }
    assignPortalUser(req, r);
    return redirectAfterPortalLogin(res, '/report-sales-admin');
  } catch (e) {
    console.error('report-sales-admin login:', e);
    return res.render('report-sales-admin/login', { error: 'Server error.', msg: '' });
  }
});

router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/report-sales-admin/login');
});

async function loadTeamOptions() {
  return queryAsync(
    `SELECT id, name FROM crm_users WHERE role='report_sales' AND is_active=1 ORDER BY name`
  );
}

// ——— Overview ———
router.get('/', requireAdmin, async (req, res) => {
  try {
    await prs.ensureSchema();
    const selectedMonth = /^\d{4}-\d{2}$/.test(String(req.query.month || ''))
      ? String(req.query.month)
      : ymNow();
    const plan = PLAN_META[req.query.plan] ? req.query.plan : '';
    const status = VALID_STATUS.includes(req.query.status) ? req.query.status : '';
    const delay = ['overdue', 'due_soon', 'on_track'].includes(req.query.delay)
      ? req.query.delay
      : '';
    const employee = req.query.employee ? parseInt(req.query.employee, 10) : 0;
    const q = (req.query.q || '').toString().trim();
    const tab = req.query.tab === 'open' ? 'open' : 'all';

    // Overview = active work only (delivered lives under /delivered)
    const where = [
      `p.status IN ('pending','claimed','in_progress','waiting_customer','ready_to_deliver')`
    ];
    const params = [];
    if (plan) {
      where.push('p.plan = ?');
      params.push(plan);
    }
    if (status && status !== 'delivered' && status !== 'cancelled') {
      where.push('p.status = ?');
      params.push(status);
    }
    if (employee && Number.isFinite(employee)) {
      where.push('p.assigned_to = ?');
      params.push(employee);
    }
    if (delay === 'overdue') {
      where.push(`p.sla_due_at IS NOT NULL AND p.sla_due_at < NOW()`);
    } else if (delay === 'due_soon') {
      where.push(
        `p.sla_due_at IS NOT NULL
         AND p.sla_due_at >= NOW() AND p.sla_due_at <= (NOW() + INTERVAL 6 HOUR)`
      );
    } else if (delay === 'on_track') {
      where.push(
        `(p.sla_due_at IS NULL OR p.sla_due_at > (NOW() + INTERVAL 6 HOUR))`
      );
    }
    if (q) {
      where.push(
        `(p.customer_name LIKE ? OR p.customer_number LIKE ? OR p.fm_order_id LIKE ? OR p.product_name LIKE ? OR p.customer_email LIKE ?)`
      );
      const like = `%${q.replace(/%/g, '\\%')}%`;
      params.push(like, like, like, like, like);
    }

    const rows = decorate(
      await queryAsync(
        `SELECT p.*, u.name AS assignee_name
         FROM prs_orders p
         LEFT JOIN crm_users u ON u.id = p.assigned_to
         WHERE ${where.join(' AND ')}
         ORDER BY
           CASE WHEN p.sla_due_at IS NULL THEN 1 ELSE 0 END,
           p.sla_due_at ASC,
           p.created_at DESC
         LIMIT 400`,
        params
      )
    );

    const bundle = await prs.getAdminKpiBundle(selectedMonth);
    const team = await loadTeamOptions();
    const flash = req.query.msg || '';

    return res.render('report-sales-admin/overview', {
      pageTitle: 'Order Overview',
      active: 'overview',
      user: req._user,
      planMeta: PLAN_META,
      rows,
      team,
      kpis: bundle.kpis,
      byPlan: bundle.byPlan,
      months: monthsList(6),
      filters: {
        month: selectedMonth,
        plan,
        status,
        delay,
        employee: employee || '',
        q,
        tab
      },
      flash
    });
  } catch (e) {
    console.error('report-sales-admin overview:', e);
    res.status(500).send('Failed to load overview.');
  }
});

// ——— Delivered (last 100) ———
router.get('/delivered', requireAdmin, async (req, res) => {
  try {
    await prs.ensureSchema();
    const plan = PLAN_META[req.query.plan] ? req.query.plan : '';
    const where = [`p.status = 'delivered'`];
    const params = [];
    if (plan) {
      where.push('p.plan = ?');
      params.push(plan);
    }
    const rows = decorate(
      await queryAsync(
        `SELECT p.*, u.name AS assignee_name
         FROM prs_orders p
         LEFT JOIN crm_users u ON u.id = p.assigned_to
         WHERE ${where.join(' AND ')}
         ORDER BY COALESCE(p.delivered_at, p.updated_at, p.created_at) DESC
         LIMIT 100`,
        params
      )
    );
    return res.render('report-sales-admin/delivered', {
      pageTitle: 'Delivered',
      active: 'delivered',
      user: req._user,
      planMeta: PLAN_META,
      rows,
      filters: { plan },
      team: await loadTeamOptions()
    });
  } catch (e) {
    console.error('report-sales-admin delivered:', e);
    res.status(500).send('Failed to load delivered.');
  }
});

// ——— Reports lookup (name / phone) ———
router.get('/reports', requireAdmin, async (req, res) => {
  try {
    await prs.ensureSchema();
    const nameQ = (req.query.name || '').toString().trim();
    const phoneQ = (req.query.phone || '').toString().trim();
    const searched = !!(nameQ || phoneQ.replace(/\D/g, ''));
    const rows = searched
      ? await prs.lookupPaidOrders({ name: nameQ, phone: phoneQ, limit: 100 })
      : [];
    return res.render('report-sales-admin/reports', {
      pageTitle: 'Order lookup',
      active: 'reports',
      user: req._user,
      planMeta: PLAN_META,
      rows,
      filters: { name: nameQ, phone: phoneQ },
      searched
    });
  } catch (e) {
    console.error('report-sales-admin reports:', e);
    res.status(500).send('Failed to load lookup.');
  }
});

// ——— Source code orders (last 100) ———
router.get('/source-orders', requireAdmin, async (req, res) => {
  try {
    await prs.ensureSchema();
    const rows = await prs.listSourceOrders(100);
    return res.render('report-sales-admin/source-orders', {
      pageTitle: 'Source code orders',
      active: 'source',
      user: req._user,
      planMeta: PLAN_META,
      rows
    });
  } catch (e) {
    console.error('report-sales-admin source-orders:', e);
    res.status(500).send('Failed to load source orders.');
  }
});

router.get('/pipeline', requireAdmin, async (req, res) => {
  try {
    await prs.ensureSchema();
    const plan = PLAN_META[req.query.plan] ? req.query.plan : '';
    const where = [
      `p.status IN ('pending','claimed','in_progress','waiting_customer','ready_to_deliver')`
    ];
    const params = [];
    if (plan) {
      where.push('p.plan = ?');
      params.push(plan);
    }
    const rows = decorate(
      await queryAsync(
        `SELECT p.*, u.name AS assignee_name
         FROM prs_orders p
         LEFT JOIN crm_users u ON u.id = p.assigned_to
         WHERE ${where.join(' AND ')}
         ORDER BY p.sla_due_at ASC, p.created_at ASC
         LIMIT 500`,
        params
      )
    );

    const columns = {
      pending: [],
      claimed: [],
      in_progress: [],
      waiting_customer: [],
      ready_to_deliver: []
    };
    rows.forEach((r) => {
      if (columns[r.status]) columns[r.status].push(r);
    });

    const bundle = await prs.getAdminKpiBundle(ymNow());
    return res.render('report-sales-admin/pipeline', {
      pageTitle: 'Pipeline',
      active: 'pipeline',
      user: req._user,
      planMeta: PLAN_META,
      columns,
      filters: { plan },
      kpis: bundle.kpis
    });
  } catch (e) {
    console.error('report-sales-admin pipeline:', e);
    res.status(500).send('Failed to load pipeline.');
  }
});

router.get('/analytics', requireAdmin, async (req, res) => {
  try {
    await prs.ensureSchema();
    const selectedMonth = /^\d{4}-\d{2}$/.test(String(req.query.month || ''))
      ? String(req.query.month)
      : ymNow();
    const bundle = await prs.getAdminKpiBundle(selectedMonth);
    return res.render('report-sales-admin/analytics', {
      pageTitle: 'Analytics',
      active: 'analytics',
      user: req._user,
      planMeta: PLAN_META,
      months: monthsList(6),
      selectedMonth,
      kpis: bundle.kpis,
      byPlan: bundle.byPlan,
      byStatus: bundle.byStatus,
      dailyDone: bundle.dailyDone,
      dailyCreated: bundle.dailyCreated
    });
  } catch (e) {
    console.error('report-sales-admin analytics:', e);
    res.status(500).send('Failed to load analytics.');
  }
});

router.get('/performance', requireAdmin, async (req, res) => {
  try {
    await prs.ensureSchema();
    const selectedMonth = /^\d{4}-\d{2}$/.test(String(req.query.month || ''))
      ? String(req.query.month)
      : ymNow();
    const bundle = await prs.getAdminKpiBundle(selectedMonth);
    return res.render('report-sales-admin/performance', {
      pageTitle: 'Team Performance',
      active: 'performance',
      user: req._user,
      planMeta: PLAN_META,
      months: monthsList(6),
      selectedMonth,
      kpis: bundle.kpis,
      team: bundle.team,
      dailyDone: bundle.dailyDone
    });
  } catch (e) {
    console.error('report-sales-admin performance:', e);
    res.status(500).send('Failed to load performance.');
  }
});

router.get('/employees', requireAdmin, async (req, res) => {
  try {
    const employees = await queryAsync(
      `SELECT id, name, email, role, is_active, created_at
       FROM crm_users
       WHERE role IN ('report_sales','report_sales_admin')
       ORDER BY role ASC, name ASC`
    );
    return res.render('report-sales-admin/employees', {
      pageTitle: 'Team Members',
      active: 'employees',
      user: req._user,
      planMeta: PLAN_META,
      employees: employees || [],
      error: req.query.error || '',
      flash: req.query.msg || ''
    });
  } catch (e) {
    console.error('report-sales-admin employees:', e);
    res.status(500).send('Failed to load employees.');
  }
});

router.post('/employees', requireAdmin, async (req, res) => {
  try {
    const name = (req.body.name || '').toString().trim();
    const email = (req.body.email || '').toString().trim().toLowerCase();
    const password = (req.body.password || '').toString().trim();
    const role =
      req.body.role === 'report_sales_admin' ? 'report_sales_admin' : 'report_sales';
    if (!name || !email || !password) {
      return res.redirect('/report-sales-admin/employees?error=' + encodeURIComponent('All fields required'));
    }
    const existing = await queryAsync(`SELECT id FROM crm_users WHERE email=? LIMIT 1`, [email]);
    if (existing.length) {
      return res.redirect(
        '/report-sales-admin/employees?error=' + encodeURIComponent('Email already exists')
      );
    }
    await queryAsync(
      `INSERT INTO crm_users (name, email, password, role, is_active, created_at)
       VALUES (?, ?, ?, ?, 1, NOW())`,
      [name, email, password, role]
    );
    return res.redirect(
      '/report-sales-admin/employees?msg=' + encodeURIComponent('Team member created')
    );
  } catch (e) {
    console.error('create employee:', e);
    return res.redirect(
      '/report-sales-admin/employees?error=' + encodeURIComponent('Could not create user')
    );
  }
});

router.post('/employees/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id === req._user.id) {
      return res.redirect('/report-sales-admin/employees?error=' + encodeURIComponent('Invalid'));
    }
    await queryAsync(
      `UPDATE crm_users SET is_active = IF(is_active=1,0,1)
       WHERE id = ? AND role IN ('report_sales','report_sales_admin')`,
      [id]
    );
    await invalidateUserSessions(id);
    return res.redirect('/report-sales-admin/employees?msg=' + encodeURIComponent('Updated'));
  } catch (e) {
    return res.redirect('/report-sales-admin/employees?error=' + encodeURIComponent('Failed'));
  }
});

router.post('/backfill', requireAdmin, async (req, res) => {
  try {
    const result = await prs.backfillFromPaidOrders(500);
    return res.redirect(
      '/report-sales-admin?msg=' +
        encodeURIComponent(
          `Backfill: scanned ${result.scanned}, created ${result.created}, skipped ${result.skipped}` +
            (result.fixedInstant ? `, fixed instant ${result.fixedInstant}` : '')
        )
    );
  } catch (e) {
    console.error('backfill:', e);
    return res.redirect(
      '/report-sales-admin?msg=' + encodeURIComponent('Backfill failed: ' + (e.message || e))
    );
  }
});

router.post('/api/:id/assign', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const assignee = req.body.assigned_to === '' || req.body.assigned_to == null
      ? null
      : parseInt(req.body.assigned_to, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    if (assignee != null && !Number.isFinite(assignee)) {
      return res.status(400).json({ ok: false, message: 'Invalid assignee' });
    }
    if (assignee == null) {
      await queryAsync(
        `UPDATE prs_orders SET assigned_to = NULL, claimed_at = NULL, updated_at = NOW() WHERE id = ?`,
        [id]
      );
    } else {
      await queryAsync(
        `UPDATE prs_orders SET
           assigned_to = ?,
           status = IF(status='pending','claimed',status),
           claimed_at = COALESCE(claimed_at, NOW()),
           updated_at = NOW()
         WHERE id = ?`,
        [assignee, id]
      );
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

router.post('/api/:id/status', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const status = (req.body.status || '').toString();
    const notes = (req.body.notes || '').toString().trim() || null;
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    if (!VALID_STATUS.includes(status)) {
      return res.status(400).json({ ok: false, message: 'Invalid status' });
    }
    if (status === 'delivered') {
      await queryAsync(
        `UPDATE prs_orders SET status=?, notes=COALESCE(?,notes), delivered_at=NOW(), updated_at=NOW() WHERE id=?`,
        [status, notes, id]
      );
    } else {
      await queryAsync(
        `UPDATE prs_orders SET status=?, notes=COALESCE(?,notes), updated_at=NOW() WHERE id=?`,
        [status, notes, id]
      );
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
