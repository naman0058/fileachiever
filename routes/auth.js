const express = require('express');
const router = express.Router();
const pool = require('./pool');
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);

// Login page (msg from query = e.g. redirect from requireAdmin)
router.get('/login', (req, res) => {
  const msg = (req.query.msg || '').toString().trim();
  res.render('freelancing/sales/login', { error: msg });
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
      `SELECT id, name, role, is_active
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

    // store in session (ensure role is string - MySQL may return Buffer in some configs)
    req.session.user = {
      id: rows[0].id,
      name: rows[0].name,
      role: String(rows[0].role || '').trim()
    };

    return res.redirect('/sales');
  } catch (e) {
    console.error('Login error:', e);
    return res.render('freelancing/sales/login', { error: 'Server error.' });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/auth/login');
});


module.exports = router;
