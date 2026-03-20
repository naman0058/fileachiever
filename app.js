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

const { leadWatcher } = require('./routes/Freelancing/lead-watcher');
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

app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '31536000'
}));

// ======================================================
// VIEW ENGINE
// ======================================================
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.set('view cache', process.env.NODE_ENV === 'production');

// ======================================================
// SESSION
// ======================================================
const sessionKeys = Array.isArray(config.sessionKeys) && config.sessionKeys.length > 0
  ? config.sessionKeys
  : ['naman'];

app.use(cookieSession({
  name: 'session',
  keys: sessionKeys,
  maxAge: 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: false
}));

// ======================================================
// LOCALS
// ======================================================
app.use((req, res, next) => {
  res.locals.start = req.query.start || '';
  res.locals.end = req.query.end || '';
  next();
});

// ======================================================
// NON-WWW TO WWW (canonical domain)
// Only redirect filemakr.com -> www.filemakr.com.
// HTTPS redirect is handled by nginx/cloudflare - do NOT do it here to avoid loops.
// ======================================================
app.use((req, res, next) => {
  const host = (req.get('host') || '').toLowerCase().split(':')[0];
  if (host === 'filemakr.com' && process.env.NODE_ENV === 'production') {
    const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').toLowerCase();
    return res.redirect(301, (proto === 'https' ? 'https' : 'http') + '://www.filemakr.com' + (req.originalUrl || req.url));
  }
  next();
});

// ======================================================
// ONLY KEEP SAFE URL NORMALIZATION
// This does not force domain/https and is safe for now.
// ======================================================
const CANONICAL_DEGREES = ['btech', 'mtech', 'be', 'me', 'bca', 'mca', 'bsc', 'msc'];

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

// ======================================================
// MALFORMED PROJECT REPORT URL REDIRECTS
// Catches *-final-year-project-report-* where prefix is not a valid degree
// e.g. online-shopping-system-final-year-project-report-email-spam-detection-system
//      hotel-booking-system-btech-final-year-project-report-email-spam-detection-system
// ======================================================
app.use((req, res, next) => {
  try {
    const m = req.path.match(/^\/(.+)-final-year-project-report-(.+)$/i);
    if (!m) return next();

    const prefix = (m[1] || '').toLowerCase().replace(/\./g, '');
    const projectSlug = (m[2] || '').trim();
    if (!projectSlug) return next();

    if (CANONICAL_DEGREES.includes(prefix)) return next();

    let degree = 'btech';
    for (const d of CANONICAL_DEGREES) {
      if (prefix.includes(d)) {
        degree = d;
        break;
      }
    }

    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    return res.redirect(301, `/${degree}-final-year-project-report-${projectSlug}${query}`);
  } catch (err) {
    return next(err);
  }
});

// ======================================================
// TRAILING SLASH REDIRECT (exempt CRM portals to avoid redirect loops)
// ======================================================
const TRAILING_SLASH_EXEMPT = ['/sales', '/project-report-manager', '/setup-support', '/source-code-manager', '/project-report-creator', '/auth'];
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
    return res.redirect(301, '/trending');
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

subApp.set('views', path.join(__dirname, 'views'));
subApp.set('view engine', 'ejs');

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

io.use((socket, next) => {
  try {
    const raw = socket.request.headers.cookie || '';
    const parsed = cookie.parse(raw);

    const sess = verifyCookieSession(parsed);
    if (!sess) return next(new Error('Invalid session cookie'));

    const user = sess.user || sess._user || sess.loginUser;
    if (!user) return next(new Error('Unauthenticated'));

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
  if (typeof leadWatcher === 'function') {
    leadWatcher();
  }
} catch (e) {
  console.error('leadWatcher failed:', e);
}

// ======================================================
// 404 + ERROR HANDLER
// ======================================================
app.use((req, res, next) => {
  next(createError(404));
});

app.use((err, req, res, next) => {
  console.error(err);

  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.render('error');
});

// ======================================================
// EXPORT
// ======================================================
module.exports = { app, server };