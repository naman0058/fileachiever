/**
 * MERN Training Program Manager toolkit access.
 * Allows legacy affiliate session (req.session.affiliation) or crm_users role mern_training_manager.
 */

function isMernTrainingManager(req) {
  const u = req.session && req.session.user;
  return !!(u && String(u.role || '').trim().toLowerCase() === 'mern_training_manager');
}

function canAccessMernManagerToolkit(req) {
  return !!(req.session && req.session.affiliation) || isMernTrainingManager(req);
}

function requireMernManagerToolkit(req, res, next) {
  if (canAccessMernManagerToolkit(req)) {
    if (req.session.user) res.locals.mernToolkitUser = req.session.user;
    else if (req.session.affiliation) res.locals.mernToolkitUser = { name: 'Affiliate', role: 'affiliate' };
    return next();
  }
  const nextPath = encodeURIComponent(req.originalUrl || '/mern-training-manager');
  return res.redirect('/mern-training-manager/login?next=' + nextPath);
}

/** Only allow relative in-app redirects after login */
function safeInternalPath(raw) {
  if (!raw || typeof raw !== 'string') return '/mern-training-manager';
  const s = raw.trim();
  if (!s.startsWith('/') || s.startsWith('//')) return '/mern-training-manager';
  return s;
}

/** Preserve portal iframe mode in affiliate/core tool URLs */
function mernPortalEmbedLocals(req, res, next) {
  res.locals.mernPortalEmbed = req.query.embed === '1' || req.query.embed === 'true';
  next();
}

const MERN_AFFILIATE_WORKSPACE_REDIRECTS = {
  '/create-task': '/mern-training-manager/workspace/create-task',
  '/review-tasks': '/mern-training-manager/workspace/review-tasks',
  '/internship': '/mern-training-manager/workspace/internship',
};

function isAffiliateToolkitIframeRequest(req) {
  if (req.query.embed === '1' || req.query.embed === 'true') return true;
  const dest = (req.get('sec-fetch-dest') || '').toLowerCase();
  return dest === 'iframe';
}

/** MERN managers: top-level browser hits to toolkit pages → portal workspace (iframe loads affiliate with embed=1). */
function redirectMernManagerAffiliatePageLoadsToWorkspace(req, res, next) {
  if (!isMernTrainingManager(req)) return next();
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (isAffiliateToolkitIframeRequest(req)) return next();

  const p = req.path || '';
  const target = MERN_AFFILIATE_WORKSPACE_REDIRECTS[p];
  if (!target) return next();

  const qIndex = req.originalUrl.indexOf('?');
  const qs = qIndex >= 0 ? req.originalUrl.slice(qIndex) : '';
  return res.redirect(302, target + qs);
}

function isMernManagerAffiliateToolkitAllowed(req) {
  const method = (req.method || 'GET').toUpperCase();
  const p = req.path || '';

  if (p === '/create-task') return method === 'GET' || method === 'HEAD' || method === 'POST';
  if (p === '/review-tasks') return method === 'GET' || method === 'HEAD';
  if (p === '/update-task-status') return method === 'POST';
  if (p.startsWith('/internship')) return method === 'GET' || method === 'HEAD';
  if (p === '/api/instagram/latest-post') return method === 'GET' || method === 'HEAD';
  return false;
}

/** Block MERN managers from the rest of /affiliate (dashboard, blogs, etc.). */
function restrictMernManagerAffiliateAccess(req, res, next) {
  if (!isMernTrainingManager(req)) return next();
  if (isMernManagerAffiliateToolkitAllowed(req)) return next();
  return res.redirect('/mern-training-manager');
}

function redirectMernManagerAddAmbassadorToPortal(req, res, next) {
  if (!isMernTrainingManager(req)) return next();
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path !== '/add-ambassador') return next();
  if (isAffiliateToolkitIframeRequest(req)) return next();
  const qIndex = req.originalUrl.indexOf('?');
  const qs = qIndex >= 0 ? req.originalUrl.slice(qIndex) : '';
  return res.redirect(302, '/mern-training-manager/workspace/add-student' + qs);
}

module.exports = {
  isMernTrainingManager,
  canAccessMernManagerToolkit,
  requireMernManagerToolkit,
  safeInternalPath,
  mernPortalEmbedLocals,
  redirectMernManagerAffiliatePageLoadsToWorkspace,
  restrictMernManagerAffiliateAccess,
  redirectMernManagerAddAmbassadorToPortal,
};
