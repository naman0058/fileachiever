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
    if (!host || host === canonicalHost) return next();

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

function resolveCookieDomain(canonicalHost) {
  const raw = String(process.env.COOKIE_DOMAIN || '').trim();
  if (raw === '0' || raw === 'false') return undefined;
  if (raw) return raw;

  if (process.env.NODE_ENV === 'production' && canonicalHost.endsWith('filemakr.com')) {
    return '.filemakr.com';
  }

  return undefined;
}

module.exports = {
  resolveCanonicalHost,
  shouldCanonicalRedirect,
  canonicalHostRedirectMiddleware,
  resolveCookieDomain
};
