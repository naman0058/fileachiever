/**
 * Setup Support Portal - Dedicated login and panel for setup support employees
 */
const express = require('express');
const path = require('path');
const router = express.Router();
const pool = require('./pool');

// Serve static assets (CSS, etc.) - must be before route handlers
router.use(express.static(path.join(__dirname, '../public/setup-support'), { maxAge: '1d' }));
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);

function getUser(req) {
  return req.user || req.session?.user || null;
}

function requireSetupSupportLogin(req, res, next) {
  const u = getUser(req);
  if (!u) return res.redirect('/setup-support/login');
  const role = String(u.role || '').trim().toLowerCase();
  if (role !== 'setup_support') return res.redirect('/setup-support/login');
  req._user = u;
  next();
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
      `SELECT id, name, role, is_active FROM crm_users WHERE email=? AND password=? LIMIT 1`,
      [email, password]
    );
    if (!rows.length) {
      return res.render('setup-support/login', { error: 'Invalid credentials.' });
    }
    const r = rows[0];
    if (String(r.role || '').trim().toLowerCase() !== 'setup_support') {
      return res.render('setup-support/login', { error: 'This login is for Setup Support only. Use the Sales CRM login.' });
    }
    if (!r.is_active) {
      return res.render('setup-support/login', { error: 'Account disabled. Contact administrator.' });
    }
    req.session.user = { id: r.id, name: r.name, role: String(r.role || '').trim() };
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
    const u = req._user;
    const tab = (req.query.tab === 'done' || req.query.tab === 'pending') ? req.query.tab : 'all';
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
      where.push(`(ss.customer_name LIKE ? OR ss.customer_number LIKE ? OR ss.enquiry LIKE ?)`);
      const like = `%${q.replace(/%/g, '\\%')}%`;
      params.push(like, like, like);
    }

    const rows = await queryAsync(`
      SELECT ss.* FROM setup_support ss
      WHERE ${where.join(' AND ')}
      ORDER BY ss.created_at DESC
      LIMIT 300
    `, params);

    let unassignedWhere = ['ss.assigned_to IS NULL', `ss.status IN ('pending','in_progress')`];
    const unassignedParams = [];
    if (q) {
      unassignedWhere.push(`(ss.customer_name LIKE ? OR ss.customer_number LIKE ? OR ss.enquiry LIKE ?)`);
      const like = `%${q.replace(/%/g, '\\%')}%`;
      unassignedParams.push(like, like, like);
    }
    let unassigned = [];
    if (tab === 'pending' || tab === 'all') {
      unassigned = await queryAsync(`
        SELECT ss.* FROM setup_support ss
        WHERE ${unassignedWhere.join(' AND ')}
        ORDER BY ss.created_at DESC
        LIMIT 50
      `, unassignedParams);
    }

    const [[pendingCount], [doneCount], [totalCount], [unassignedCount]] = await Promise.all([
      queryAsync(`SELECT COUNT(*) AS c FROM setup_support WHERE assigned_to = ? AND status IN ('pending','in_progress')`, [u.id]),
      queryAsync(`SELECT COUNT(*) AS c FROM setup_support WHERE assigned_to = ? AND status = 'done'`, [u.id]),
      queryAsync(`SELECT COUNT(*) AS c FROM setup_support WHERE assigned_to = ?`, [u.id]),
      queryAsync(`SELECT COUNT(*) AS c FROM setup_support WHERE assigned_to IS NULL AND status IN ('pending','in_progress')`, [])
    ]);

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
        total: totalCount?.c || 0,
        pending: pendingCount?.c || 0,
        done: doneCount?.c || 0,
        available: unassignedCount?.c || 0
      },
      pendingCount: pendingCount?.c || 0,
      doneCount: doneCount?.c || 0
    });
  } catch (e) {
    res.status(500).send('Failed to load dashboard.');
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
    await queryAsync(`UPDATE setup_support SET assigned_to = ?, updated_at = NOW() WHERE id = ?`, [req._user.id, id]);
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
      await queryAsync(`UPDATE setup_support SET status = ?, notes = COALESCE(?, notes), completed_at = NOW(), updated_at = NOW() WHERE id = ?`, [status, notes, id]);
    } else {
      await queryAsync(`UPDATE setup_support SET status = ?, notes = COALESCE(?, notes), updated_at = NOW() WHERE id = ?`, [status, notes, id]);
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
