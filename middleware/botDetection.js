'use strict';

const {
  detectBot,
  getClientIp,
  getSessionKey,
  isRateLimitExcluded,
  resolveBotInfo
} = require('../utils/botDetection');
const rateLimitLog = require('../services/rateLimitLogService');
const checkoutFunnel = require('../services/checkoutFunnelService');

/** In-memory sliding window — single PM2 instance. Key = route + IP + session. */
const buckets = new Map();
const CLEANUP_EVERY_MS = 60_000;
let lastCleanup = Date.now();

function cleanupBuckets(now) {
  if (now - lastCleanup < CLEANUP_EVERY_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.start > bucket.windowMs * 2) buckets.delete(key);
  }
}

function hitBucket(key, windowMs, max) {
  const now = Date.now();
  cleanupBuckets(now);
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= windowMs) {
    bucket = { start: now, count: 0, windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return { allowed: bucket.count <= max, count: bucket.count };
}

/** Site-wide: UA classification only (no rate limiting here). */
function attachBotDetection(req, res, next) {
  req.botInfo = detectBot(req.get('user-agent'));
  next();
}

/**
 * Route-specific rate limiter — only mount on /checkout and /api/checkout/funnel.
 * Payment gateway paths are never limited.
 */
function createRateLimiter(options) {
  const windowMs = options.windowMs || 60_000;
  const limits = options.limits || {
    human: 120,
    untrusted_bot: 25,
    empty_ua: 15,
    verified_crawler: null
  };
  const keyPrefix = options.keyPrefix || 'rl';

  return async function rateLimitMiddleware(req, res, next) {
    if (isRateLimitExcluded(req.path)) {
      return next();
    }

    if (req.funnelSkipRateLimit) {
      return next();
    }

    const bot = await resolveBotInfo(req);
    req.botInfo = bot;

    if (bot.verified && limits.verified_crawler === null) {
      return next();
    }

    let max = limits.human;
    if (bot.bot_name === 'empty-ua') max = limits.empty_ua;
    else if (bot.is_bot) max = limits.untrusted_bot;
    else if (bot.verified) max = limits.verified_crawler;

    if (!max || max <= 0) return next();

    const ip = getClientIp(req) || 'unknown';
    const sessionKey = getSessionKey(req);
    const route = `${req.method}:${req.baseUrl || ''}${req.path || ''}`;
    const limitKey = `${keyPrefix}:${ip}:${sessionKey}:${route}`;

    const { allowed, count } = hitBucket(limitKey, windowMs, max);
    if (allowed) {
      return next();
    }

    rateLimitLog.log429({
      route: req.originalUrl || req.path,
      method: req.method,
      ip_address: ip,
      session_key: sessionKey,
      user_agent: req.get('user-agent'),
      is_bot: bot.is_bot,
      bot_name: bot.bot_name,
      bot_verified: bot.verified,
      limit_key: limitKey + `:count=${count}`
    });

    res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
    if (req.path && req.path.startsWith('/api/')) {
      return res.status(429).json({ ok: false, error: 'too_many_requests' });
    }
    return res.status(429).send('Too many requests. Please try again shortly.');
  };
}

const checkoutPageRateLimit = createRateLimiter({
  keyPrefix: 'checkout',
  windowMs: 60_000,
  limits: { human: 80, untrusted_bot: 30, empty_ua: 12 }
});

const checkoutFunnelRateLimit = createRateLimiter({
  keyPrefix: 'funnel',
  windowMs: 60_000,
  limits: { human: 100, untrusted_bot: 20, empty_ua: 10 }
});

/**
 * Session-bound funnel_id + circuit breaker.
 * Invalid funnel_id → counts toward IP/session rate limit (no DB).
 * Suppressed burst → 200 OK path, no DB, no rate-limit counter.
 */
function funnelTrackingGuard(req, res, next) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const funnelId = String(body.funnel_id || '').trim();

  if (!checkoutFunnel.isFunnelBoundToSession(req.session, funnelId)) {
    req.funnelSkipDbInsert = true;
    req.funnelInvalid = true;
    return next();
  }

  const guard = checkoutFunnel.guardClientFunnelEvent(funnelId, body.event_name);

  if (!guard.accept) {
    req.funnelSkipRateLimit = true;
    req.funnelSkipDbInsert = true;
    if (guard.duplicate) req.funnelDeduped = true;
    if (guard.suppressed) {
      req.funnelSuppressed = true;
      checkoutFunnel.noteBurstSuppression(req, funnelId, { suppressed_count: 1 });
    }
  }

  next();
}

module.exports = {
  attachBotDetection,
  createRateLimiter,
  checkoutFunnelRateLimit,
  checkoutPageRateLimit,
  funnelTrackingGuard
};
