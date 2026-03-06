/**
 * Blog Master Admin - Add/manage content writers
 * Requires admin session (login at /admin first)
 */
require('dotenv').config();
const express = require('express');
const router = express.Router();
const pool2 = require('../pool2');
const crypto = require('crypto');
const util = require('util');
const queryAsync = util.promisify(pool2.query).bind(pool2);

const SALT = process.env.BLOG_WRITER_SALT || 'filemakr-blog-writer-2024';
const ITERATIONS = 100000;
const KEYLEN = 64;
const DIGEST = 'sha512';

function hashPassword(password) {
  return crypto.pbkdf2Sync(password, SALT, ITERATIONS, KEYLEN, DIGEST).toString('hex');
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminid) {
    return res.redirect('/admin?redirect=/blog-admin');
  }
  next();
}

router.use(requireAdmin);

router.get('/', async (req, res) => {
  try {
    const writers = await queryAsync(
      'SELECT id, name, email, status, created_at FROM blog_writers ORDER BY created_at DESC'
    );
    const count = await queryAsync('SELECT COUNT(*) as c FROM blog_writers');
    res.render('blog/admin/dashboard', { writers, total: count[0].c });
  } catch (err) {
    console.error('blog admin list:', err);
    res.status(500).send('Error loading writers.');
  }
});

router.get('/add-writer', (req, res) => {
  res.render('blog/admin/addWriter', { msg: '' });
});

router.post('/add-writer', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.render('blog/admin/addWriter', { msg: 'All fields required.' });
  }
  if (password.length < 6) {
    return res.render('blog/admin/addWriter', { msg: 'Password must be at least 6 characters.' });
  }
  try {
    const existing = await queryAsync('SELECT id FROM blog_writers WHERE email = ?', [email.trim()]);
    if (existing.length) {
      return res.render('blog/admin/addWriter', { msg: 'Email already registered.' });
    }
    const hash = hashPassword(password);
    await queryAsync(
      'INSERT INTO blog_writers (name, email, password_hash, status) VALUES (?, ?, ?, ?)',
      [name.trim(), email.trim().toLowerCase(), hash, 'active']
    );
    res.redirect('/blog-admin?added=1');
  } catch (err) {
    console.error('blog admin add-writer:', err);
    res.render('blog/admin/addWriter', { msg: 'Error adding writer.' });
  }
});

router.post('/writer/:id/toggle', async (req, res) => {
  try {
    const [w] = await queryAsync('SELECT status FROM blog_writers WHERE id = ?', [req.params.id]);
    if (!w) return res.redirect('/blog-admin');
    const newStatus = w.status === 'active' ? 'inactive' : 'active';
    await queryAsync('UPDATE blog_writers SET status = ? WHERE id = ?', [newStatus, req.params.id]);
    res.redirect('/blog-admin');
  } catch (err) {
    console.error('Toggle writer:', err);
    res.redirect('/blog-admin');
  }
});

router.get('/writer/:id/delete', async (req, res) => {
  try {
    await queryAsync('DELETE FROM blog_writers WHERE id = ?', [req.params.id]);
    res.redirect('/blog-admin');
  } catch (err) {
    console.error('Delete writer:', err);
    res.redirect('/blog-admin');
  }
});

module.exports = router;
