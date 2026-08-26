function isLocalHost(host) {
  const h = String(host || '').toLowerCase().split(':')[0];
  return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost');
}

/**
 * Resolve the canonical host for redirects and absolute URLs.
 * Bare filemakr.com always maps to www.filemakr.com unless CANONICAL_HOST is set.
 */
function resolveCanonicalHost() {
  const explicit = String(process.env.CANONICAL_HOST || '').trim().toLowerCase();
  if (explicit) return explicit;

  const base = String(process.env.SITE_BASE_URL || '').trim();
  try {
    if (base) {
      const host = new URL(base).hostname.toLowerCase();
      if (host === 'filemakr.com') return 'www.filemakr.com';
      return host;
    }
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

  return `${scheme}://${canonicalHost}`;
}

module.exports = {
  isLocalHost,
  resolveCanonicalHost,
  shouldCanonicalRedirect,
  canonicalHostRedirectMiddleware,
  resolveCookieDomain,
  resolveSiteBaseUrl
};
