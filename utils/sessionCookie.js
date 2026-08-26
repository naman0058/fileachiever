/**
 * Drop bloated checkout session cookies before cookie-session reads them.
 * Browsers reject new Set-Cookie when an existing ~4KB session cookie is present.
 */
const SESSION_COOKIE = 'session';
const SESSION_SIG_COOKIE = 'session.sig';
/** ~3KB base64 payload — portal sessions are normally under 500 bytes. */
const MAX_SESSION_COOKIE_LEN = 2800;

function stripOversizedSessionCookies(req, _res, next) {
  const raw = req.headers.cookie;
  if (!raw || typeof raw !== 'string') return next();

  let sessionLen = 0;
  let sigLen = 0;
  const kept = [];

  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(`${SESSION_COOKIE}=`)) {
      sessionLen = trimmed.length - SESSION_COOKIE.length - 1;
      continue;
    }
    if (trimmed.startsWith(`${SESSION_SIG_COOKIE}=`)) {
      sigLen = trimmed.length - SESSION_SIG_COOKIE.length - 1;
      continue;
    }
    kept.push(part);
  }

  if (sessionLen <= MAX_SESSION_COOKIE_LEN && sigLen <= 128) {
    return next();
  }

  const nextCookie = kept.join('; ').trim();
  if (nextCookie) {
    req.headers.cookie = nextCookie;
  } else {
    delete req.headers.cookie;
  }

  next();
}

module.exports = {
  stripOversizedSessionCookies,
  MAX_SESSION_COOKIE_LEN
};
