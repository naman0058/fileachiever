'use strict';

/** Safe Cache-Control for anonymous public blog HTML (not API/session). */
function blogPublicCacheHeaders(req, res, next) {
  res.set(
    'Cache-Control',
    process.env.BLOG_HTML_CACHE_CONTROL || 'public, max-age=30, stale-while-revalidate=120'
  );
  res.set('Vary', 'Accept-Encoding');
  next();
}

module.exports = { blogPublicCacheHeaders };
