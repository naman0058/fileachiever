const express = require('express');
const router = express.Router();
const pool = require('./pool');
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);
const {
  buildSessionUser,
  validateSessionUser,
  destroySession,
  SESSION_INVALID_MESSAGES
} = require('../utils/crmSession');

// Login page (msg from query = e.g. redirect from requireAdmin)
router.get('/login', (req, res) => {
  const msg = (req.query.msg || '').toString().trim();
  res.render('freelancing/sales/login', { error: msg });
});

// Lightweight session check for client-side auto-logout
router.get('/session-check', async (req, res) => {
  const u = req.session && req.session.user;
  if (!u) {
    return res.status(401).json({ ok: false, redirect: '/auth/login' });
  }

  try {
    const v = await validateSessionUser(u);
    if (!v.ok) {
      const msg = SESSION_INVALID_MESSAGES[v.reason] || SESSION_INVALID_MESSAGES.missing;
      destroySession(req);
      return res.status(401).json({
        ok: false,
        message: msg,
        redirect: `/auth/login?msg=${encodeURIComponent(msg)}`
      });
    }
    req.session.user = v.user;
    return res.json({ ok: true });
  } catch (e) {
    console.error('Session check error:', e);
    destroySession(req);
    return res.status(500).json({ ok: false, redirect: '/auth/login' });
  }
});

// Login submit (NO encryption)
router.post('/login', async (req, res) => {
  try {
    const email = (req.body.email || '').toString().trim();
    const password = (req.body.password || '').toString().trim();

    if (!email || !password) {
      return res.render('freelancing/sales/login', { error: 'Email and password required.' });
    }

    const rows = await queryAsync(
      `SELECT id, name, role, is_active, session_token
       FROM crm_users
       WHERE email=? AND password=?
       LIMIT 1`,
      [email, password]
    );

    if (!rows.length) {
      return res.render('freelancing/sales/login', { error: 'Invalid credentials.' });
    }
    if (!rows[0].is_active) {
      return res.render('freelancing/sales/login', { error: 'Account disabled.' });
    }

    const role = String(rows[0].role || '').trim().toLowerCase();
    if (role === 'setup_support') {
      return res.render('freelancing/sales/login', {
        error: 'This account uses the Setup Support Portal. Please use the link below.',
        setupSupportLink: true
      });
    }
    if (role === 'source_code_manager') {
      return res.render('freelancing/sales/login', {
        error: 'This account uses the Source Code Manager Portal. Please use the link below.',
        sourceCodeManagerLink: true
      });
    }
    if (role === 'project_report_manager') {
      return res.render('freelancing/sales/login', {
        error: 'This account uses the Project Report Manager Portal. Please use the link below.',
        projectReportManagerLink: true
      });
    }
    if (role === 'mern_training_manager') {
      return res.render('freelancing/sales/login', {
        error: 'This account uses the MERN Training Program Manager Portal. Please use the link below.',
        mernTrainingManagerLink: true
      });
    }

    req.session.user = buildSessionUser(rows[0]);

    return res.redirect('/sales');
  } catch (e) {
    console.error('Login error:', e);
    return res.render('freelancing/sales/login', { error: 'Server error.' });
  }
});

// Logout
router.get('/logout', (req, res) => {
  destroySession(req);
  res.redirect('/auth/login');
});


module.exports = router;
