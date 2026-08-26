/**
 * Cloudflare Worker: Cloudinary CDN proxy + 1-year edge cache.
 *
 * ROUTES (keep only these):
 *   www.filemakr.com/cloudinary*
 *   filemakr.com/cloudinary*
 *
 * Verify 2nd network request (not browser memory cache):
 *   X-FM-Cache: HIT, X-FM-Origin: 0
 *
 * Note: Chrome DevTools shows "(from memory cache)" with headers from the
 * FIRST fetch (often MISS). That does NOT mean Cloudinary was hit again —
 * no network request was made. Uncheck "Disable cache" and reload to verify.
 */

const EDGE_TTL = 31536000; // 1 year
const CACHE_CONTROL = `public, max-age=${EDGE_TTL}, immutable`;
const CDN_CACHE_CONTROL = `public, max-age=${EDGE_TTL}`;

/** Dedupe concurrent fetches for the same cache key (catalog grids). */
const inflight = new Map();

function isCloudinaryPath(pathname) {
  return pathname.startsWith('/cloudinary/');
}

function isValidCloudinaryAssetPath(pathname) {
  return /^\/cloudinary\/[^/]+\/(image|video|raw)\//i.test(pathname);
}

function cloudinaryUpstream(requestUrl) {
  const url = new URL(requestUrl);
  return (
    'https://res.cloudinary.com' +
    url.pathname.replace(/^\/cloudinary/, '') +
    url.search
  );
}

/** Stable key: ignore www — do not vary on Accept/UA. */
function cacheKeyRequest(request) {
  const url = new URL(request.url);
  url.hostname = url.hostname.replace(/^www\./i, '');
  url.protocol = 'https:';
  url.hash = '';
  return new Request(url.toString(), { method: 'GET' });
}

function cacheKeyString(request) {
  return cacheKeyRequest(request).url;
}

function applyCacheHeaders(headers, { fmCache, originHit, ageSec }) {
  const h = new Headers(headers);

  [
    'set-cookie',
    'set-cookie2',
    'vary',
    'pragma',
    'expires',
    'age',
    'cdn-cache-control',
    'cloudflare-cdn-cache-control',
    'surrogate-control',
    'cf-cache-status',
    'cf-ray',
    'connection',
    'keep-alive',
    'transfer-encoding',
    'content-encoding'
  ].forEach((name) => h.delete(name));

  h.set('Cache-Control', CACHE_CONTROL);
  h.set('CDN-Cache-Control', CDN_CACHE_CONTROL);
  h.set('Cloudflare-CDN-Cache-Control', CDN_CACHE_CONTROL);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  h.set('Timing-Allow-Origin', '*');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-FM-Cache', fmCache);
  h.set('X-FM-Origin', originHit ? '1' : '0');
  h.set('X-FM-Proxy', 'cloudinary-worker/4');
  if (ageSec != null && ageSec >= 0) h.set('Age', String(ageSec));
  return h;
}

async function passThroughToOrigin(request) {
  return fetch(request);
}

async function respondFromCached(cached, method) {
  const headers = applyCacheHeaders(cached.headers, {
    fmCache: 'HIT',
    originHit: false,
    ageSec: 0
  });
  return new Response(method === 'HEAD' ? null : cached.body, {
    status: cached.status,
    statusText: cached.statusText,
    headers
  });
}

async function fetchAndStore(request, cache, key, keyStr) {
  const originResponse = await fetch(cloudinaryUpstream(request.url), {
    method: 'GET',
    headers: {
      Accept: 'image/avif,image/webp,image/*;q=0.8,*/*;q=0.5',
      'User-Agent': 'FileMakr-Cloudinary-Proxy/4.0'
    },
    cf: {
      cacheEverything: true,
      cacheTtl: EDGE_TTL,
      cacheTtlByStatus: {
        '200-299': EDGE_TTL,
        '404': 60,
        '500-599': 0
      }
    }
  });

  const status = originResponse.status;
  const statusText = originResponse.statusText;
  const bodyBuf = await originResponse.arrayBuffer();

  const outHeaders = applyCacheHeaders(originResponse.headers, {
    fmCache: 'MISS',
    originHit: true,
    ageSec: 0
  });

  if (originResponse.ok && bodyBuf.byteLength >= 0) {
    const storeHeaders = applyCacheHeaders(originResponse.headers, {
      fmCache: 'HIT',
      originHit: false,
      ageSec: 0
    });
    const toStore = new Response(bodyBuf.slice(0), {
      status,
      statusText,
      headers: storeHeaders
    });
    // Await put so the next request (reload / parallel tab) sees HIT immediately
    await cache.put(key, toStore);
  }

  return new Response(request.method === 'HEAD' ? null : bodyBuf, {
    status,
    statusText,
    headers: outHeaders
  });
}

async function handleCloudinary(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Accept, Content-Type',
        'Access-Control-Max-Age': '86400',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(request.url);
  if (!isValidCloudinaryAssetPath(url.pathname)) {
    return new Response('Bad cloudinary path', { status: 400 });
  }

  const cache = caches.default;
  const key = cacheKeyRequest(request);
  const keyStr = cacheKeyString(request);

  const cached = await cache.match(key);
  if (cached) {
    return respondFromCached(cached, request.method);
  }

  // Same URL already fetching — wait for that instead of hitting Cloudinary again
  if (inflight.has(keyStr)) {
    return inflight.get(keyStr);
  }

  const job = fetchAndStore(request, cache, key, keyStr).finally(() => {
    inflight.delete(keyStr);
  });
  inflight.set(keyStr, job);
  return job;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (!isCloudinaryPath(url.pathname)) {
      return passThroughToOrigin(request);
    }
    return handleCloudinary(request);
  }
};
