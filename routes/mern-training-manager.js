/**
 * MERN Training Program Manager — dedicated login and dashboard.
 * Create users in crm_users with role = 'mern_training_manager'.
 */
const express = require('express');
const path = require('path');
const pool = require('./pool');
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);
const { buildSessionUser, enforceCrmSession, assignPortalUser, redirectAfterPortalLogin, findCrmUserByCredentials } = require('../utils/crmSession');
const { safeInternalPath, isMernTrainingManager } = require('./mernManagerAccess');

const router = express.Router();

router.use(express.static(path.join(__dirname, '../public/setup-support'), { maxAge: '1d' }));

function getMernManagerUser(req) {
  const u = req.session && req.session.user;
  if (u && String(u.role || '').trim().toLowerCase() === 'mern_training_manager') return u;
  return null;
}

async function requireMernManagerLogin(req, res, next) {
  const result = await enforceCrmSession(req, res, '/mern-training-manager/login');
  if (!result) return;
  const role = String(result.role || '').trim().toLowerCase();
  if (role !== 'mern_training_manager') return res.redirect('/mern-training-manager/login');
  req._mernUser = result;
  return next();
}

router.get('/login', (req, res) => {
  if (getMernManagerUser(req)) {
    return res.redirect('/mern-training-manager');
  }
  res.render('mern-training-manager/login', {
    error: '',
    nextPath: safeInternalPath(req.query.next || ''),
  });
});

router.post('/login', async (req, res) => {
  try {
    const email = (req.body.email || '').toString().trim();
    const password = (req.body.password || '').toString().trim();
    const nextPath = safeInternalPath(req.body.next || req.query.next);

    if (!email || !password) {
      return res.render('mern-training-manager/login', {
        error: 'Email and password required.',
        nextPath,
      });
    }

    const r = await findCrmUserByCredentials(email, password);
    if (!r) {
      return res.render('mern-training-manager/login', {
        error: 'Invalid credentials.',
        nextPath,
      });
    }

    if (String(r.role || '').trim().toLowerCase() !== 'mern_training_manager') {
      return res.render('mern-training-manager/login', {
        error: 'This portal is for MERN Training Program Managers only.',
        nextPath,
      });
    }
    if (!r.is_active) {
      return res.render('mern-training-manager/login', {
        error: 'Account disabled. Contact an administrator.',
        nextPath,
      });
    }

    assignPortalUser(req, r);

    const dest =
      !nextPath || nextPath.startsWith('/mern-training-manager/login') ? '/mern-training-manager' : nextPath;
    return redirectAfterPortalLogin(res, dest);
  } catch (e) {
    console.error('mern-training-manager login', e);
    return res.render('mern-training-manager/login', {
      error: 'Server error.',
      nextPath: safeInternalPath(req.body.next),
    });
  }
});

router.get('/logout', (req, res) => {
  if (req.session) delete req.session.user;
  res.redirect('/mern-training-manager/login');
});

function workspaceIframeQuery(req) {
  const params = new URLSearchParams(req.query);
  params.set('embed', '1');
  return params.toString();
}

router.get('/workspace/add-student', requireMernManagerLogin, (req, res) => {
  res.render('mern-training-manager/tool-shell', {
    user: req._mernUser,
    activeTool: 'add-student',
    iframeSrc: '/add-ambassador?' + workspaceIframeQuery(req),
    pageTitle: 'Add student & onboarding',
  });
});

router.get('/workspace/create-task', requireMernManagerLogin, (req, res) => {
  res.render('mern-training-manager/tool-shell', {
    user: req._mernUser,
    activeTool: 'create-task',
    iframeSrc: '/affiliate/create-task?' + workspaceIframeQuery(req),
    pageTitle: 'Create task',
  });
});

router.get('/workspace/review-tasks', requireMernManagerLogin, (req, res) => {
  res.render('mern-training-manager/tool-shell', {
    user: req._mernUser,
    activeTool: 'review-tasks',
    iframeSrc: '/affiliate/review-tasks?' + workspaceIframeQuery(req),
    pageTitle: 'Review tasks',
  });
});

router.get('/workspace/internship', requireMernManagerLogin, (req, res) => {
  res.render('mern-training-manager/tool-shell', {
    user: req._mernUser,
    activeTool: 'internship',
    iframeSrc: '/affiliate/internship?' + workspaceIframeQuery(req),
    pageTitle: 'Internship dashboard',
  });
});

router.get('/', requireMernManagerLogin, (req, res) => {
  res.render('mern-training-manager/dashboard', {
    user: req._mernUser,
  });
});

module.exports = router;
