/**
 * CRM session helpers — validate active users and invalidate sessions on access change.
 */
const util = require('util');
const pool = require('../routes/pool');

const queryAsync = util.promisify(pool.query).bind(pool);

const SESSION_INVALID_MESSAGES = {
  missing: 'Please log in again.',
  deleted: 'Your account has been removed.',
  inactive: 'Your account has been disabled.',
  revoked: 'Your session has expired. Please log in again.'
};

function buildSessionUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    role: String(row.role || '').trim(),
    sv: Number(row.session_token) || 1
  };
}

async function findCrmUserByCredentials(email, password) {
  const creds = [String(email || '').trim(), String(password || '').trim()];
  try {
    const rows = await queryAsync(
      `SELECT id, name, role, is_active, session_token
       FROM crm_users
       WHERE email=? AND password=?
       LIMIT 1`,
      creds
    );
    return rows[0] || null;
  } catch (e) {
    if (e && e.code === 'ER_BAD_FIELD_ERROR' && /session_token/i.test(String(e.message || ''))) {
      const rows = await queryAsync(
        `SELECT id, name, role, is_active
         FROM crm_users
         WHERE email=? AND password=?
         LIMIT 1`,
        creds
      );
      if (!rows[0]) return null;
      return { ...rows[0], session_token: 1 };
    }
    throw e;
  }
}

function assignPortalUser(req, row) {
  const payload = {
    user: buildSessionUser({
      ...row,
      session_token: row.session_token != null ? row.session_token : 1
    }),
    portal_login_at: Date.now()
  };
  // Drop any bloated checkout cookie and write a fresh signed session (cookie-session API).
  req.session = null;
  req.session = payload;
}

function redirectAfterPortalLogin(res, url) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  return res.redirect(303, url);
}

async function fetchUserSessionState(userId) {
  try {
    const rows = await queryAsync(
      `SELECT id, name, role, is_active, session_token
       FROM crm_users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  } catch (e) {
    if (e && e.code === 'ER_BAD_FIELD_ERROR' && /session_token/i.test(String(e.message || ''))) {
      const rows = await queryAsync(
        `SELECT id, name, role, is_active
         FROM crm_users
         WHERE id = ?
         LIMIT 1`,
        [userId]
      );
      if (!rows[0]) return null;
      return { ...rows[0], session_token: 1 };
    }
    throw e;
  }
}

async function validateSessionUser(sessionUser) {
  if (!sessionUser || sessionUser.id == null) {
    return { ok: false, reason: 'missing' };
  }

  const row = await fetchUserSessionState(sessionUser.id);
  if (!row) return { ok: false, reason: 'deleted' };
  if (!row.is_active) return { ok: false, reason: 'inactive' };

  const dbSv = Number(row.session_token) || 1;
  const sessSv = sessionUser.sv;

  if (sessSv != null && Number(sessSv) !== dbSv) {
    return { ok: false, reason: 'revoked' };
  }

  return { ok: true, user: buildSessionUser(row) };
}

async function invalidateUserSessions(userId) {
  await queryAsync(
    `UPDATE crm_users
     SET session_token = COALESCE(session_token, 1) + 1
     WHERE id = ?`,
    [userId]
  );
}

function destroySession(req) {
  req.session = null;
}

function isJsonRequest(req) {
  const accept = (req.headers.accept || '').toString();
  const xhr = req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest';
  return xhr || accept.includes('application/json') || (req.path || '').startsWith('/api/');
}

function sessionInvalidResponse(req, res, loginUrl, reason) {
  const msg = SESSION_INVALID_MESSAGES[reason] || SESSION_INVALID_MESSAGES.missing;
  destroySession(req);

  if (isJsonRequest(req)) {
    return res.status(401).json({
      ok: false,
      message: msg,
      redirect: `${loginUrl}?msg=${encodeURIComponent(msg)}`
    });
  }

  return res.redirect(`${loginUrl}?msg=${encodeURIComponent(msg)}`);
}

async function enforceCrmSession(req, res, loginUrl) {
  const u = req.session && req.session.user;
  if (!u) {
    if (isJsonRequest(req)) {
      res.status(401).json({ ok: false, redirect: loginUrl });
    } else {
      res.redirect(loginUrl);
    }
    return null;
  }

  try {
    const v = await validateSessionUser(u);
    if (!v.ok) {
      sessionInvalidResponse(req, res, loginUrl, v.reason);
      return null;
    }
    req.session.user = v.user;
    return v.user;
  } catch (e) {
    console.error('CRM session validation error:', e);
    if (isJsonRequest(req)) {
      res.status(503).json({ ok: false, message: 'Database temporarily unavailable.' });
    } else {
      res.status(503).send('Database temporarily unavailable. Please try again in a moment.');
    }
    return null;
  }
}

module.exports = {
  buildSessionUser,
  findCrmUserByCredentials,
  assignPortalUser,
  redirectAfterPortalLogin,
  fetchUserSessionState,
  validateSessionUser,
  invalidateUserSessions,
  destroySession,
  isJsonRequest,
  sessionInvalidResponse,
  enforceCrmSession,
  SESSION_INVALID_MESSAGES
};
