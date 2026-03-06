const express = require('express');
const router = express.Router();
const pool = require('./pool');
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);

// Login page
router.get('/login', (req, res) => {
  res.render('freelancing/sales/login', { error: '' });
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

    // store in session
    req.session.user = {
      id: rows[0].id,
      name: rows[0].name,
      role: rows[0].role
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
