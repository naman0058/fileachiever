const DEFAULT_SITE_ORIGIN = 'https://www.filemakr.com';

function isLocalHost(host) {
  const h = String(host || '').toLowerCase().split(':')[0];
  return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost');
}

function isInvalidPublicHostname(host) {
  const h = String(host || '').toLowerCase();
  return !h || h === 'www' || h === 'www.';
}

/** Normalize SITE_BASE_URL / config — rejects broken values like https://www. */
function normalizeSiteOrigin(input) {
  const fallback = DEFAULT_SITE_ORIGIN;
  const raw = String(input || '').trim();
  if (!raw) return fallback;
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    let host = u.hostname.toLowerCase();
    if (isInvalidPublicHostname(host)) return fallback;
    if (host === 'filemakr.com') host = 'www.filemakr.com';
    if (!isLocalHost(host) && !host.endsWith('filemakr.com')) {
      return fallback;
    }
    const scheme = u.protocol === 'http:' ? 'http' : 'https';
    return `${scheme}://${host}`;
  } catch (_) {
    return fallback;
  }
}

function isBrokenCanonicalUrl(url) {
  const s = String(url || '').trim();
  if (!s) return true;
  if (/^https?:\/\/www\.(\/|$|\?)/i.test(s)) return true;
  if (/^https?:\/\/www\.$/i.test(s)) return true;
  try {
    return isInvalidPublicHostname(new URL(s).hostname);
  } catch (_) {
    return true;
  }
}

function sanitizeCanonicalUrl(url, siteOrigin) {
  const origin = normalizeSiteOrigin(siteOrigin);
  const s = String(url || '').trim();
  if (!s || isBrokenCanonicalUrl(s)) {
    return `${origin}/`;
  }
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    if (isInvalidPublicHostname(host)) {
      return `${origin.replace(/\/$/, '')}${u.pathname || '/'}${u.search || ''}`;
    }
    if (host === 'filemakr.com') {
      u.hostname = 'www.filemakr.com';
    }
    return u.toString();
  } catch (_) {
    if (s.startsWith('/')) return `${origin.replace(/\/$/, '')}${s}`;
    return `${origin}/`;
  }
}

function shouldUseFilemakrOrigin(req) {
  const hostname = (req.get('host') || '').toLowerCase().split(':')[0];
  if (isLocalHost(hostname)) return false;
  if (isInvalidPublicHostname(hostname)) return true;
  if (hostname === 'filemakr.com' || hostname === 'www.filemakr.com') return true;
  return hostname.endsWith('.filemakr.com');
}

/** Absolute URL for the current request (canonical link, og:url). */
function buildRequestFullUrl(req, siteOrigin) {
  const origin = normalizeSiteOrigin(siteOrigin);
  const pathOnly = req.originalUrl || req.url || '/';

  const hostname = (req.get('host') || '').toLowerCase().split(':')[0];
  if (isLocalHost(hostname)) {
    const hostHeader = req.get('host') || 'localhost:3000';
    const proto = (req.get('x-forwarded-proto') || req.protocol || 'http')
      .split(',')[0]
      .trim()
      .toLowerCase();
    const scheme = proto === 'https' ? 'https' : 'http';
    return `${scheme}://${hostHeader}${pathOnly}`;
  }

  if (shouldUseFilemakrOrigin(req)) {
    return `${origin.replace(/\/$/, '')}${pathOnly}`;
  }

  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const scheme = proto === 'https' ? 'https' : 'http';
  const hostHeader = req.get('host') || hostname;
  return `${scheme}://${hostHeader}${pathOnly}`;
}

/**
 * Resolve the canonical host for redirects and absolute URLs.
 * Bare filemakr.com always maps to www.filemakr.com unless CANONICAL_HOST is set.
 */
function resolveCanonicalHost() {
  const explicit = String(process.env.CANONICAL_HOST || '').trim().toLowerCase();
  if (explicit) return explicit;

  const origin = normalizeSiteOrigin(process.env.SITE_BASE_URL || DEFAULT_SITE_ORIGIN);
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === 'filemakr.com') return 'www.filemakr.com';
    if (!isInvalidPublicHostname(host)) return host;
  } catch (_) {
    /* ignore */
  }

  return 'www.filemakr.com';
}

function shouldCanonicalRedirect() {
  const flag = String(process.env.CANONICAL_REDIRECT || '').trim().toLowerCase();
  if (flag === '0' || flag === 'false') return false;
  if (flag === '1' || flag === 'true') return true;
  return process.env.NODE_ENV === 'production';
}

function canonicalHostRedirectMiddleware(canonicalHost) {
  return (req, res, next) => {
    if (!shouldCanonicalRedirect()) return next();

    const host = (req.get('host') || '').toLowerCase().split(':')[0];
    if (!host || isLocalHost(host) || host === canonicalHost) return next();

    const apex = canonicalHost.replace(/^www\./, '');
    if (host !== apex && !host.endsWith('.' + apex)) return next();

    const proto = (req.get('x-forwarded-proto') || req.protocol || 'https')
      .toLowerCase()
      .split(',')[0]
      .trim();
    const scheme = proto === 'https' ? 'https' : 'http';
    return res.redirect(301, `${scheme}://${canonicalHost}${req.originalUrl || req.url}`);
  };
}

function resolveCookieDomain() {
  const raw = String(process.env.COOKIE_DOMAIN || '').trim();
  if (!raw || raw === '0' || raw === 'false') return undefined;
  return raw;
}

/** Request-scoped base URL — localhost stays on localhost; production uses canonical host. */
function resolveSiteBaseUrl(req, canonicalHost) {
  const hostHeader = req.get('host') || 'localhost:3000';
  const host = hostHeader.toLowerCase().split(':')[0];
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const scheme = proto === 'https' ? 'https' : 'http';

  if (isLocalHost(host)) {
    return `${scheme}://${hostHeader}`;
  }

  return normalizeSiteOrigin(process.env.SITE_BASE_URL || `https://${canonicalHost}`);
}

module.exports = {
  DEFAULT_SITE_ORIGIN,
  isLocalHost,
  normalizeSiteOrigin,
  sanitizeCanonicalUrl,
  buildRequestFullUrl,
  resolveCanonicalHost,
  shouldCanonicalRedirect,
  canonicalHostRedirectMiddleware,
  resolveCookieDomain,
  resolveSiteBaseUrl
};
