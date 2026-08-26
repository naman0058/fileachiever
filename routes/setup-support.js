/**
 * Setup Support Portal - Dedicated login and panel for setup support employees
 */
const express = require('express');
const path = require('path');
const router = express.Router();
const pool = require('./pool');

router.use(express.static(path.join(__dirname, '../public/setup-support'), { maxAge: '1d' }));
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);
const { buildSessionUser, enforceCrmSession } = require('../utils/crmSession');
const setupSupportService = require('../services/setupSupportService');

function getUser(req) {
  return req.user || req.session?.user || null;
}

function monthStartSql() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function ymNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(selectedMonth) {
  const start = `${selectedMonth}-01`;
  const [y, m] = selectedMonth.split('-').map(Number);
  const endDate = new Date(y, m, 1);
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
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

async function requireSetupSupportLogin(req, res, next) {
  const result = await enforceCrmSession(req, res, '/setup-support/login');
  if (!result) return;
  const role = String(result.role || '').trim().toLowerCase();
  if (role !== 'setup_support') return res.redirect('/setup-support/login');
  req._user = result;
  return next();
}

async function getMemberPerformance(userId, selectedMonth) {
  const { start, end } = monthRange(selectedMonth);
  const [[openPending], [inProgress], [doneLifetime], [doneMonth], [assignedMonth], [avgHours], [aging], [available]] =
    await Promise.all([
      queryAsync(
        `SELECT COUNT(*) AS c FROM setup_support WHERE assigned_to = ? AND status IN ('pending','in_progress')`,
        [userId]
      ),
      queryAsync(
        `SELECT COUNT(*) AS c FROM setup_support WHERE assigned_to = ? AND status = 'in_progress'`,
        [userId]
      ),
      queryAsync(`SELECT COUNT(*) AS c FROM setup_support WHERE assigned_to = ? AND status = 'done'`, [
        userId
      ]),
      queryAsync(
        `SELECT COUNT(*) AS c FROM setup_support
         WHERE assigned_to = ? AND status = 'done' AND completed_at >= ? AND completed_at < ?`,
        [userId, start, end]
      ),
      queryAsync(
        `SELECT COUNT(*) AS c FROM setup_support
         WHERE assigned_to = ? AND created_at >= ? AND created_at < ?`,
        [userId, start, end]
      ),
      queryAsync(
        `SELECT ROUND(AVG(TIMESTAMPDIFF(HOUR, created_at, completed_at)), 1) AS h
         FROM setup_support
         WHERE assigned_to = ? AND status = 'done'
           AND completed_at >= ? AND completed_at < ? AND completed_at IS NOT NULL`,
        [userId, start, end]
      ),
      queryAsync(
        `SELECT COUNT(*) AS c FROM setup_support
         WHERE assigned_to = ? AND status IN ('pending','in_progress')
           AND created_at < (NOW() - INTERVAL 24 HOUR)`,
        [userId]
      ),
      queryAsync(
        `SELECT COUNT(*) AS c FROM setup_support
         WHERE assigned_to IS NULL AND status IN ('pending','in_progress')`
      )
    ]);

  const dailyDone = await queryAsync(
    `SELECT DATE(completed_at) AS d, COUNT(*) AS c
     FROM setup_support
     WHERE assigned_to = ? AND status = 'done'
       AND completed_at >= ? AND completed_at < ?
     GROUP BY DATE(completed_at)
     ORDER BY d ASC`,
    [userId, start, end]
  );

  return {
    month: selectedMonth,
    openPending: Number(openPending && openPending.c) || 0,
    inProgress: Number(inProgress && inProgress.c) || 0,
    doneLifetime: Number(doneLifetime && doneLifetime.c) || 0,
    doneMonth: Number(doneMonth && doneMonth.c) || 0,
    assignedMonth: Number(assignedMonth && assignedMonth.c) || 0,
    avgHours: avgHours && avgHours.h != null ? Number(avgHours.h) : null,
    aging24h: Number(aging && aging.c) || 0,
    available: Number(available && available.c) || 0,
    dailyDone: dailyDone || []
  };
}

// Login
router.get('/login', (req, res) => {
  if (getUser(req) && String(getUser(req).role || '').toLowerCase() === 'setup_support') {
    return res.redirect('/setup-support');
  }
  res.render('setup-support/login', { error: '' });
});

router.post('/login', async (req, res) => {
  try {
    const email = (req.body.email || '').toString().trim();
    const password = (req.body.password || '').toString().trim();
    if (!email || !password) {
      return res.render('setup-support/login', { error: 'Email and password required.' });
    }
    const rows = await queryAsync(
      `SELECT id, name, role, is_active, session_token FROM crm_users WHERE email=? AND password=? LIMIT 1`,
      [email, password]
    );
    if (!rows.length) {
      return res.render('setup-support/login', { error: 'Invalid credentials.' });
    }
    const r = rows[0];
    if (String(r.role || '').trim().toLowerCase() !== 'setup_support') {
      return res.render('setup-support/login', {
        error: 'This login is for Setup Support only. Use the Sales CRM login.'
      });
    }
    if (!r.is_active) {
      return res.render('setup-support/login', { error: 'Account disabled. Contact administrator.' });
    }
    req.session.user = buildSessionUser(r);
    return res.redirect('/setup-support');
  } catch (e) {
    return res.render('setup-support/login', { error: 'Server error.' });
  }
});

router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/setup-support/login');
});

// Dashboard
router.get('/', requireSetupSupportLogin, async (req, res) => {
  try {
    await setupSupportService.ensureSchema();
    const u = req._user;
    const tab = req.query.tab === 'done' || req.query.tab === 'pending' ? req.query.tab : 'all';
    const q = (req.query.q || '').toString().trim();
    const statusFilter = (req.query.status || '').toString();

    let where = ['ss.assigned_to = ?'];
    const params = [u.id];
    if (tab === 'pending') where.push(`ss.status IN ('pending','in_progress')`);
    else if (tab === 'done') where.push(`ss.status = 'done'`);

    if (statusFilter && ['pending', 'in_progress', 'done', 'cancelled'].includes(statusFilter)) {
      where.push(`ss.status = ?`);
      params.push(statusFilter);
    }
    if (q) {
      where.push(
        `(ss.customer_name LIKE ? OR ss.customer_number LIKE ? OR ss.enquiry LIKE ? OR ss.fm_order_id LIKE ? OR ss.product_name LIKE ? OR ss.customer_email LIKE ?)`
      );
      const like = `%${q.replace(/%/g, '\\%')}%`;
      params.push(like, like, like, like, like, like);
    }

    const rows = await queryAsync(
      `
      SELECT ss.* FROM setup_support ss
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE
          WHEN ss.status = 'in_progress' THEN 0
          WHEN ss.status = 'pending' THEN 1
          ELSE 2
        END,
        ss.created_at ASC
      LIMIT 300
    `,
      params
    );

    let unassignedWhere = ['ss.assigned_to IS NULL', `ss.status IN ('pending','in_progress')`];
    const unassignedParams = [];
    if (q) {
      unassignedWhere.push(
        `(ss.customer_name LIKE ? OR ss.customer_number LIKE ? OR ss.enquiry LIKE ? OR ss.fm_order_id LIKE ? OR ss.product_name LIKE ?)`
      );
      const like = `%${q.replace(/%/g, '\\%')}%`;
      unassignedParams.push(like, like, like, like, like);
    }
    let unassigned = [];
    if (tab === 'pending' || tab === 'all') {
      unassigned = await queryAsync(
        `
        SELECT ss.* FROM setup_support ss
        WHERE ${unassignedWhere.join(' AND ')}
        ORDER BY ss.created_at ASC
        LIMIT 50
      `,
        unassignedParams
      );
    }

    const perf = await getMemberPerformance(u.id, ymNow());
    const active = tab === 'pending' ? 'pending' : tab === 'done' ? 'done' : 'all';
    const filters = { tab, q, status: statusFilter };
    const buildQuery = (t) => {
      const p = new URLSearchParams();
      if (t !== 'all') p.set('tab', t);
      if (q) p.set('q', q);
      if (statusFilter) p.set('status', statusFilter);
      return p.toString();
    };

    return res.render('setup-support/dashboard', {
      pageTitle: 'Setup Support',
      active,
      user: u,
      rows,
      unassigned,
      filters,
      buildQuery,
      stats: {
        total: perf.doneLifetime + perf.openPending,
        pending: perf.openPending,
        done: perf.doneLifetime,
        available: perf.available,
        doneMonth: perf.doneMonth,
        inProgress: perf.inProgress,
        aging24h: perf.aging24h,
        avgHours: perf.avgHours,
        assignedMonth: perf.assignedMonth
      },
      pendingCount: perf.openPending,
      doneCount: perf.doneLifetime,
      perf
    });
  } catch (e) {
    console.error('setup-support dashboard error:', e);
    res.status(500).send('Failed to load dashboard.');
  }
});

// Personal performance
router.get('/performance', requireSetupSupportLogin, async (req, res) => {
  try {
    await setupSupportService.ensureSchema();
    const selectedMonth = /^\d{4}-\d{2}$/.test(String(req.query.month || ''))
      ? String(req.query.month)
      : ymNow();
    const perf = await getMemberPerformance(req._user.id, selectedMonth);
    return res.render('setup-support/performance', {
      pageTitle: 'My Performance',
      active: 'performance',
      user: req._user,
      months: monthsList(6),
      selectedMonth,
      perf,
      filters: { tab: 'all', q: '', status: '' },
      buildQuery: () => ''
    });
  } catch (e) {
    console.error('setup-support performance error:', e);
    res.status(500).send('Failed to load performance.');
  }
});

// API: Claim
router.post('/api/:id/claim', requireSetupSupportLogin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    const rows = await queryAsync(`SELECT id, assigned_to FROM setup_support WHERE id = ? LIMIT 1`, [id]);
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Not found' });
    if (rows[0].assigned_to) return res.status(400).json({ ok: false, message: 'Already assigned' });
    await queryAsync(`UPDATE setup_support SET assigned_to = ?, status = IF(status='pending','in_progress',status), updated_at = NOW() WHERE id = ? AND assigned_to IS NULL`, [
      req._user.id,
      id
    ]);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// API: Update status
router.post('/api/:id/status', requireSetupSupportLogin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const status = (req.body.status || '').toString();
    const notes = (req.body.notes || '').toString().trim() || null;
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    if (!['pending', 'in_progress', 'done', 'cancelled'].includes(status)) {
      return res.status(400).json({ ok: false, message: 'Invalid status' });
    }
    const rows = await queryAsync(`SELECT id, assigned_to FROM setup_support WHERE id = ? LIMIT 1`, [id]);
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Not found' });
    if (rows[0].assigned_to !== req._user.id) {
      return res.status(403).json({ ok: false, message: 'Not assigned to you' });
    }
    if (status === 'done') {
      await queryAsync(
        `UPDATE setup_support SET status = ?, notes = COALESCE(?, notes), completed_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [status, notes, id]
      );
    } else {
      await queryAsync(
        `UPDATE setup_support SET status = ?, notes = COALESCE(?, notes), updated_at = NOW() WHERE id = ?`,
        [status, notes, id]
      );
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
