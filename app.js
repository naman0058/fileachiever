/**
 * FileAchiever - Main application entry
 * Simplified stable version (no canonical redirects for now)
 */

require('dotenv').config();

const config = require('./config');
const createError = require('http-errors');
const http = require('http');
const cookieSession = require('cookie-session');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const compression = require('compression');
const bodyParser = require('body-parser');
const vhost = require('vhost');
const { Server } = require('socket.io');
const cookie = require('cookie');
const Keygrip = require('keygrip');
const ejs = require('ejs');
const { createGtmInjectMiddleware } = require('./middleware/gtmInject');
const { createCloudinaryHtmlOptimizeMiddleware } = require('./middleware/cloudinaryHtmlOptimize');
const {
  cloudinaryDisplayUrl,
  cloudinarySrcSet,
  browserHelperSource: cloudinaryBrowserHelperSource,
  getCdnHost: getCloudinaryCdnHost,
  getCdnBase: getCloudinaryCdnBase
} = require('./utils/cloudinaryDisplay');
const { resolveOgImageUrl, defaultOgImageUrl } = require('./utils/ogImage');
const { imageAltLabel } = require('./utils/imageAlt');
const { projectReportUrl } = require('./routes/projectReportShared');
const onPageSeo = require('./routes/onPageSeo');

const viewsPath = path.join(__dirname, 'views');

function configureEjsEngine(appInstance) {
  appInstance.engine('ejs', (filePath, data, callback) => {
    ejs.renderFile(
      filePath,
      data,
      {
        root: viewsPath,
        views: [viewsPath],
        filename: filePath,
        cache: process.env.NODE_ENV === 'production',
        async: false
      },
      callback
    );
  });
}

const { startLeadWatcher } = require('./routes/Freelancing/lead-watcher');
const { verifySocketAuthToken } = require('./utils/socketAuth');
const { validateSessionUser } = require('./utils/crmSession');
const {
  resolveCanonicalHost,
  canonicalHostRedirectMiddleware,
  resolveCookieDomain,
  resolveSiteBaseUrl
} = require('./utils/canonicalHost');
// require('./routes/leaderboardCron'); // disabled

const manishaRouter = require('./subdomains/manisha');
const leadWebhook = require('./routes/Freelancing/lead-webhook');

const app = express();
const subApp = express();
const server = http.createServer(app);

// ======================================================
// APP SETTINGS
// ======================================================
app.set('trust proxy', true);
app.disable('x-powered-by');

// ======================================================
// MIDDLEWARES
// ======================================================
app.use(compression());
app.use(logger('dev'));

app.use(express.json({ limit: '50mb' }));
app.use(bodyParser.json({ limit: '200mb' }));
app.use(bodyParser.urlencoded({
  limit: '200mb',
  extended: true,
  parameterLimit: 1000000
}));
app.use(express.urlencoded({ extended: false }));

// Redirect bare / wrong host to canonical www BEFORE session cookies are read or set.
const canonicalHost = resolveCanonicalHost();
app.use(canonicalHostRedirectMiddleware(canonicalHost));

app.use(cookieParser());

// Skip static only for /shopkeeper root: public/shopkeeper/ exists (theme assets) and would 301 to /shopkeeper/.
const publicDir = path.join(__dirname, 'public');
const staticOpts = { maxAge: '31536000' };
app.use((req, res, next) => {
  if (req.path === '/shopkeeper' || req.path === '/shopkeeper/') {
    return next();
  }
  express.static(publicDir, staticOpts)(req, res, next);
});

// ======================================================
// VIEW ENGINE
// ======================================================
app.set('views', viewsPath);
app.set('view engine', 'ejs');
configureEjsEngine(app);
app.set('view cache', process.env.NODE_ENV === 'production');

app.locals.cloudinaryUrl = cloudinaryDisplayUrl;
app.locals.cloudinarySrcSet = cloudinarySrcSet;
app.locals.cloudinaryBrowserHelper = cloudinaryBrowserHelperSource;
app.locals.cloudinaryCdnHost = getCloudinaryCdnHost();
app.locals.cloudinaryCdnBase = getCloudinaryCdnBase();
app.locals.ogImageUrl = resolveOgImageUrl;
app.locals.defaultOgImageUrl = defaultOgImageUrl;
app.locals.imageAltLabel = imageAltLabel;
app.locals.projectReportUrl = projectReportUrl;
app.locals.blogPostHeading = onPageSeo.blogPostHeading;
app.locals.blogPostExcerpt = onPageSeo.blogPostExcerpt;

// ======================================================
// SESSION
// ======================================================
const sessionKeys = Array.isArray(config.sessionKeys) && config.sessionKeys.length > 0
  ? config.sessionKeys
  : ['naman'];

const cookieDomain = resolveCookieDomain();

app.use(cookieSession({
  name: 'session',
  keys: sessionKeys,
  maxAge: 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  domain: cookieDomain,
  // Secure cookies only work over HTTPS. Localhost uses HTTP even with NODE_ENV=production.
  secure: process.env.COOKIE_SECURE === 'true' || process.env.COOKIE_SECURE === '1'
}));

// ======================================================
// LOCALS
// ======================================================
app.use((req, res, next) => {
  res.locals.start = req.query.start || '';
  res.locals.end = req.query.end || '';
  res.locals.siteBaseUrl = resolveSiteBaseUrl(req, canonicalHost);
  res.locals.gtmContainerId = config.gtmContainerId;
  res.locals.ga4MeasurementId = config.ga4MeasurementId;
  res.locals.googleAdsConversionId = config.googleAdsConversionId;
  res.locals.googleAdsConversionLabel = config.googleAdsConversionLabel;
  res.locals.cloudinaryUrl = cloudinaryDisplayUrl;
  res.locals.cloudinarySrcSet = cloudinarySrcSet;
  res.locals.cloudinaryCdnHost = getCloudinaryCdnHost();
  res.locals.cloudinaryCdnBase = getCloudinaryCdnBase();
  res.locals.ogImageUrl = resolveOgImageUrl;
  res.locals.defaultOgImageUrl = defaultOgImageUrl;
  res.locals.imageAltLabel = imageAltLabel;
  res.locals.projectReportUrl = projectReportUrl;
  res.locals.blogPostHeading = onPageSeo.blogPostHeading;
  res.locals.blogPostExcerpt = onPageSeo.blogPostExcerpt;
  next();
});

app.use(createGtmInjectMiddleware(config.gtmContainerId));
app.use(createCloudinaryHtmlOptimizeMiddleware());

// ======================================================
// ONLY KEEP SAFE URL NORMALIZATION
// This does not force domain/https and is safe for now.
// ======================================================
const CANONICAL_DEGREES = ['btech', 'mtech', 'be', 'me', 'bca', 'mca', 'bsc', 'msc'];
const { legacyProjectReportRedirect, canonicalReportUrlRedirect } = require('./routes/projectReportShared');

app.use((req, res, next) => {
  try {
    const match = req.path.match(/^\/([^/]+)-final-year-project-report(-[^/]*)?$/i);
    if (!match) return next();

    const rawDegree = (match[1] || '').toLowerCase().replace(/\./g, '');
    const suffix = match[2] || '';

    if (!CANONICAL_DEGREES.includes(rawDegree)) {
      return next();
    }

    const expectedPath = `/${rawDegree}-final-year-project-report${suffix}`;
    const query = req.originalUrl.includes('?')
      ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
      : '';

    if (req.path !== expectedPath) {
      return res.redirect(301, `${expectedPath}${query}`);
    }

    return next();
  } catch (err) {
    return next(err);
  }
});

// Legacy report detail URLs → /{db_seo_name}-report
app.use(async (req, res, next) => {
  try {
    const target = await legacyProjectReportRedirect(req);
    if (target) {
      return res.redirect(301, target);
    }
    return next();
  } catch (err) {
    return next(err);
  }
});

// Partial slug URLs (/short-name-report) → full DB seo_name URL
app.use(async (req, res, next) => {
  try {
    const target = await canonicalReportUrlRedirect(req);
    if (target) {
      return res.redirect(301, target);
    }
    return next();
  } catch (err) {
    return next(err);
  }
});

// ======================================================
// TRAILING SLASH REDIRECT (exempt CRM portals to avoid redirect loops)
// ======================================================
const TRAILING_SLASH_EXEMPT = ['/sales', '/project-report-manager', '/mern-training-manager', '/setup-support', '/source-code-manager', '/project-report-creator', '/auth', '/mern-training-program', '/shopkeeper', '/report-sales', '/report-sales-admin'];
app.use((req, res, next) => {
  if (req.path.length > 1 && req.path.endsWith('/')) {
    const base = req.path.replace(/\/$/, '');
    if (TRAILING_SLASH_EXEMPT.some(p => base === p || base.startsWith(p + '/'))) {
      return next();
    }
    return res.redirect(301, req.path.slice(0, -1) + (req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : ''));
  }
  next();
});

// ======================================================
// LEGACY / STATIC REDIRECTS
// ======================================================
const LEGACY_REDIRECTS = {
  '/trending': '/blog',
  '/terms': '/terms-and-conditions',
  '/final-year-project-tools': '/final-year-project-ideas',
  '/final-year-projects-list': '/final-year-project-ideas',
  '/privacy': '/privacy-policy',
  '/refund': '/refund-policy',
};
app.use((req, res, next) => {
  const target = LEGACY_REDIRECTS[req.path];
  if (target && target !== req.path) {
    const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    return res.redirect(301, target + q);
  }
  next();
});

// ======================================================
// MALFORMED / BROKEN URL REDIRECTS
// ======================================================
app.use((req, res, next) => {
  const p = req.path;
  if (p.includes('<') || p.includes('>') || p.includes('"') || /\/[a-z]-$/.test(p)) {
    return res.redirect(301, '/');
  }
  if (p.startsWith('/us/trends/') && p.length < 30) {
    return res.redirect(301, '/blog');
  }
  next();
});

// ======================================================
// SPECIAL REDIRECTS
// ======================================================
app.use((req, res, next) => {
  if (req.path === '/blog writer' || req.path === '/blog%20writer') {
    return res.redirect(301, '/blog-writer');
  }
  if (req.path === '/btech-final-year-project-report-e-' || req.path === '/btech-final-year-project-report-e') {
    return res.redirect(301, '/btech-final-year-project-report');
  }
  if (req.path === '/ieee-standard-project-report-examples') {
    return res.redirect(301, '/btech-final-year-project-report');
  }
  return next();
});

// ======================================================
// SUBDOMAIN APP SETUP
// ======================================================
subApp.set('trust proxy', true);
subApp.disable('x-powered-by');

subApp.use(compression());
subApp.use(logger('dev'));

subApp.use(express.json({ limit: '50mb' }));
subApp.use(bodyParser.json({ limit: '200mb' }));
subApp.use(bodyParser.urlencoded({
  limit: '200mb',
  extended: true,
  parameterLimit: 1000000
}));
subApp.use(express.urlencoded({ extended: false }));

subApp.use(cookieParser());

subApp.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '31536000'
}));

subApp.set('views', viewsPath);
subApp.set('view engine', 'ejs');
configureEjsEngine(subApp);

subApp.use('/', manishaRouter);

// vhost mappings
app.use(vhost('manisha.filemakr.com', subApp));
app.use(vhost('manisha.localhost', subApp));

// ======================================================
// SOCKET.IO
// ======================================================
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});

const COOKIE_SESSION_NAME = 'session';
const keygrip = new Keygrip(sessionKeys);

function decodeCookieSessionValue(val) {
  if (!val) return null;

  val = decodeURIComponent(val);

  if (val.startsWith('j:')) {
    return JSON.parse(val.slice(2));
  }

  let b64 = val.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';

  const json = Buffer.from(b64, 'base64').toString('utf8');
  return JSON.parse(json);
}

function verifyCookieSession(parsedCookies) {
  const value = parsedCookies[COOKIE_SESSION_NAME];
  const sig = parsedCookies[`${COOKIE_SESSION_NAME}.sig`];

  if (!value || !sig) return null;

  const data = `${COOKIE_SESSION_NAME}=${value}`;
  const ok = keygrip.verify(data, sig);

  if (!ok) return null;

  return decodeCookieSessionValue(value);
}

io.use(async (socket, next) => {
  try {
    let user = verifySocketAuthToken(socket.handshake.auth?.token);

    if (!user) {
      const raw = socket.request.headers.cookie || '';
      const parsed = cookie.parse(raw);

      const sess = verifyCookieSession(parsed);
      if (!sess) return next(new Error('Invalid session cookie'));

      user = sess.user || sess._user || sess.loginUser;
    }

    if (!user) return next(new Error('Unauthenticated'));

    if (user.sv != null && user.id != null) {
      const v = await validateSessionUser(user);
      if (!v.ok) return next(new Error('Session revoked'));
      user = v.user;
    }

    socket.user = user;
    return next();
  } catch (e) {
    return next(new Error('Socket auth failed'));
  }
});

io.on('connection', (socket) => {
  console.log('✅ Socket connected:', socket.id, socket.user?.name, socket.user?.role);

  socket.join('sales');

  if (socket.user?.role) {
    socket.join(`role:${socket.user.role}`);
  }

  socket.emit('socket:ready', {
    ok: true,
    user: {
      id: socket.user.id,
      name: socket.user.name,
      role: socket.user.role
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected:', socket.id);
  });
});

/**
 * When PM2/nginx runs more than one Node worker, io.to("sales").emit only reaches
 * sockets on the same process as the HTTP request that handled the webhook. Optional
 * Redis adapter broadcasts to all workers.
 */
async function setupSocketIoAdapter() {
  const url =
    process.env.SOCKET_IO_REDIS_URL ||
    (String(process.env.REDIS_URL || '').startsWith('redis://')
      ? process.env.REDIS_URL
      : '');
  if (!url) {
    console.warn(
      '[socket.io] No SOCKET_IO_REDIS_URL (or redis:// REDIS_URL). Using default in-memory adapter — OK only with a single Node process. If lead:new does not show in the browser while webhooks return 200, set SOCKET_IO_REDIS_URL or run PM2 with instances: 1.'
    );
    return;
  }
  try {
    const { createClient } = require('redis');
    const { createAdapter } = require('@socket.io/redis-adapter');
    const pubClient = createClient({ url });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[socket.io] Redis adapter enabled (multi-worker lead broadcasts)');
  } catch (e) {
    console.error('[socket.io] Redis adapter failed:', e.message);
    throw e;
  }
}

app.set('io', io);

// ======================================================
// WEBHOOKS / SSE
// ======================================================
app.use('/salesalert', leadWebhook);

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const timer = setInterval(() => {
    res.write('data: ping\n\n');
    if (typeof res.flush === 'function') res.flush();
  }, 2000);

  req.on('close', () => {
    clearInterval(timer);
  });
});

// ======================================================
// ROUTES
// ======================================================
app.use(require('./routes'));

// ======================================================
// CRONS / WATCHERS
// ======================================================
try {
  const disabled =
    process.env.LEAD_WATCHER_ENABLED === '0' ||
    process.env.LEAD_WATCHER_ENABLED === 'false';
  const instanceId = String(process.env.NODE_APP_INSTANCE ?? process.env.pm_id ?? '0');
  if (!disabled && instanceId === '0') {
    startLeadWatcher();
  }
} catch (e) {
  console.error('leadWatcher failed:', e);
}

try {
  const { scheduleDailyAttendanceMorningMail } = require('./routes/dailyTaskMorningCron');
  scheduleDailyAttendanceMorningMail();
} catch (e) {
  console.error('scheduleDailyAttendanceMorningMail failed:', e);
}

// ======================================================
// 404 + ERROR HANDLER
// ======================================================
app.use((req, res, next) => {
  next(createError(404));
});

app.use(async (err, req, res, next) => {
  console.error(err);

  const status = err.status || 500;
  const onPageSeo = require('./routes/onPageSeo');
  let category = Array.isArray(req.categories) ? req.categories : [];
  if (!category.length) {
    try {
      const pool = require('./routes/pool');
      category = await new Promise((resolve) => {
        pool.query('SELECT id, name, seo_name FROM category', (e, rows) => {
          resolve(e ? [] : (rows || []));
        });
      });
    } catch (_) {
      category = [];
    }
  }

  let fullUrl = req.fullUrl;
  if (!fullUrl) {
    const host = ((req.get('host') || 'www.filemakr.com').toLowerCase().split(':')[0] === 'filemakr.com')
      ? 'www.filemakr.com'
      : ((req.get('host') || 'www.filemakr.com').split(':')[0]);
    const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').toLowerCase();
    fullUrl = (proto === 'https' ? 'https' : 'http') + '://' + host + (req.originalUrl || req.url || '');
  }

  const is404 = status === 404;
  const Metatags = is404
    ? onPageSeo.errorPage
    : {
        ...onPageSeo.errorPage,
        title: 'Something Went Wrong | FileMakr',
        description: 'An unexpected error occurred. Please return to FileMakr home or contact support for project report and source code help.'
      };

  res.status(status);
  res.render('error', {
    message: err.message || (is404 ? 'Page not found' : 'Something went wrong'),
    error: req.app.get('env') === 'development' ? err : { status },
    Metatags,
    CommonMetaTags: onPageSeo.commonMetaTags,
    category,
    fullUrl,
    active: '',
    graduation_type_send: '',
    statusCode: status
  });
});

// ======================================================
// EXPORT
// ======================================================
module.exports = { app, server, setupSocketIoAdapter };