const crypto = require('crypto');
const config = require('../config');

const SECRET =
  process.env.SOCKET_AUTH_SECRET ||
  (Array.isArray(config.sessionKeys) && config.sessionKeys[0]) ||
  'naman';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function createSocketAuthToken(user) {
  if (!user || user.id == null) return '';

  const payload = {
    id: user.id,
    name: user.name,
    role: user.role,
    exp: Date.now() + TOKEN_TTL_MS
  };

  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySocketAuthToken(token) {
  if (!token || typeof token !== 'string') return null;

  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!payload || payload.exp < Date.now()) return null;
  if (payload.id == null) return null;

  return {
    id: payload.id,
    name: payload.name,
    role: payload.role
  };
}

module.exports = { createSocketAuthToken, verifySocketAuthToken };
