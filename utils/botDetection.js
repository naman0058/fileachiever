'use strict';

const dns = require('dns').promises;
const crypto = require('crypto');

/**
 * UA classification — trusted_claim does NOT bypass rate limits until DNS verified.
 */
const KNOWN_BOTS = [
  { pattern: /googlebot/i, name: 'googlebot', verify: 'googlebot' },
  { pattern: /bingbot/i, name: 'bingbot', verify: 'bingbot' },
  { pattern: /applebot/i, name: 'applebot', verify: 'applebot' },
  { pattern: /duckduckbot/i, name: 'duckduckbot', verify: 'duckduckbot' },
  { pattern: /yandexbot/i, name: 'yandexbot', verify: 'yandexbot' },
  { pattern: /meta-externalagent/i, name: 'meta-externalagent', verify: null },
  { pattern: /facebookexternalhit/i, name: 'facebookexternalhit', verify: null },
  { pattern: /linkedinbot/i, name: 'linkedinbot', verify: null },
  { pattern: /twitterbot/i, name: 'twitterbot', verify: null },
  { pattern: /slackbot/i, name: 'slackbot', verify: null },
  { pattern: /petalbot/i, name: 'petalbot', verify: null },
  { pattern: /semrushbot/i, name: 'semrushbot', verify: null },
  { pattern: /ahrefsbot/i, name: 'ahrefsbot', verify: null },
  { pattern: /[a-z0-9_-]+bot\b|crawler|spider|preview|archiver|wget\/|curl\/|python-requests|scrapy|headless|phantomjs|puppeteer/i, name: 'generic-bot', verify: null }
];

/** Reverse-DNS suffixes for verified crawler bypass (not UA-only). */
const VERIFY_DNS_SUFFIXES = {
  googlebot: ['.googlebot.com', '.google.com'],
  bingbot: ['.search.msn.com'],
  applebot: ['.applebot.apple.com'],
  duckduckbot: ['.duckduckgo.com'],
  yandexbot: ['.yandex.ru', '.yandex.net', '.yandex.com']
};

const verifyCache = new Map();
const VERIFY_CACHE_MS = 60 * 60 * 1000;

/** Never rate-limit payment gateway / webhook return paths. */
const RATE_LIMIT_EXCLUDED_PATHS = [
  /^\/ccav/i,
  /^\/salesalert/i,
  /^\/checkout\/submit$/i,
  /^\/checkout\/dummy-pay$/i,
  /^\/checkout\/review$/i
];

function detectBot(userAgent) {
  const ua = String(userAgent || '').trim();
  if (!ua) {
    return {
      is_bot: true,
      bot_name: 'empty-ua',
      trusted_claim: false,
      trusted: false,
      verified: false
    };
  }
  for (const bot of KNOWN_BOTS) {
    if (bot.pattern.test(ua)) {
      const trustedClaim = !!bot.verify;
      return {
        is_bot: true,
        bot_name: bot.name,
        trusted_claim: trustedClaim,
        trusted: false,
        verified: false,
        verify_as: bot.verify || null
      };
    }
  }
  return {
    is_bot: false,
    bot_name: null,
    trusted_claim: false,
    trusted: false,
    verified: false,
    verify_as: null
  };
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  const raw = req.ip || (Array.isArray(xff) ? xff[0] : String(xff || '').split(',')[0].trim()) || '';
  return String(raw).replace(/^::ffff:/, '').slice(0, 64);
}

function getSessionKey(req) {
  if (req.sessionID) return String(req.sessionID).slice(0, 128);
  const raw = req.headers.cookie || '';
  const m = raw.match(/(?:^|;\s*)session=([^;]+)/);
  if (m && m[1]) {
    return ('ck:' + crypto.createHash('sha256').update(m[1]).digest('hex')).slice(0, 128);
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const funnel = body.checkout_funnel_id || body.funnel_id || req.query?.checkout_funnel_id;
  if (funnel) return ('fn:' + String(funnel)).slice(0, 128);
  return 'anon';
}

function isRateLimitExcluded(path) {
  const p = String(path || '');
  return RATE_LIMIT_EXCLUDED_PATHS.some((re) => re.test(p));
}

async function verifyTrustedBotIp(ip, verifyAs) {
  if (!ip || !verifyAs) return false;
  const suffixes = VERIFY_DNS_SUFFIXES[verifyAs];
  if (!suffixes || !suffixes.length) return false;

  const cacheKey = `${verifyAs}:${ip}`;
  const cached = verifyCache.get(cacheKey);
  if (cached && Date.now() - cached.at < VERIFY_CACHE_MS) {
    return cached.ok;
  }

  let ok = false;
  try {
    const hosts = await dns.reverse(ip);
    const host = (hosts[0] || '').toLowerCase();
    if (!host || !suffixes.some((s) => host.endsWith(s))) {
      ok = false;
    } else {
      const resolved = await dns.lookup(host);
      ok = resolved && resolved.address === ip;
    }
  } catch (_) {
    ok = false;
  }

  verifyCache.set(cacheKey, { ok, at: Date.now() });
  return ok;
}

async function resolveBotInfo(req) {
  const base = req.botInfo || detectBot(req.get('user-agent'));
  if (!base.is_bot || !base.verify_as) {
    return base;
  }

  const ip = getClientIp(req);
  const verified = await verifyTrustedBotIp(ip, base.verify_as);
  return {
    ...base,
    verified,
    trusted: verified,
    bot_name: verified ? base.bot_name : ('fake-' + base.bot_name)
  };
}

function botInfoFromReq(req) {
  if (req && req.botInfo) return req.botInfo;
  return detectBot(req && req.get ? req.get('user-agent') : '');
}

module.exports = {
  KNOWN_BOTS,
  RATE_LIMIT_EXCLUDED_PATHS,
  detectBot,
  getClientIp,
  getSessionKey,
  isRateLimitExcluded,
  verifyTrustedBotIp,
  resolveBotInfo,
  botInfoFromReq
};
