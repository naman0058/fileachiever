'use strict';

/**
 * Fast read path for public blog pages (automate_blog.blogs).
 * Parameterized queries, lean column lists, optional in-memory cache.
 */

const util = require('util');
const pool2 = require('../routes/pool2');
const {
  appendPublicBlogWhere,
  filterPublicBlogRows,
  isPublicBlogRow,
} = require('../utils/blogPublic');
const { hydrateBlogContentFields } = require('../utils/blogContentModel');

const queryAsync = util.promisify(pool2.query).bind(pool2);

const LIST_SELECT = `
  id, title, slug, meta_title, meta_description, meta_abstract, category,
  thumbnail_url, author_id, created_at, updated_at, reading_time_minutes,
  tags, focus_keyword, status
`.replace(/\s+/g, ' ').trim();

const CARD_SELECT = `
  id, title, slug, meta_title, meta_description, meta_abstract,
  thumbnail_url, created_at, category, reading_time_minutes, status
`.replace(/\s+/g, ' ').trim();

const DETAIL_BASE_SELECT = `
  id, title, slug, content, meta_title, meta_description, meta_abstract, category,
  thumbnail_url, meta_keywords, tags, author_id, focus_keyword, canonical_url,
  status, reading_time_minutes, schema_markup, created_at, updated_at
`.replace(/\s+/g, ' ').trim();

/** Full detail projection when content-model columns exist (also used in EXPLAIN fixtures). */
const DETAIL_SELECT = `${DETAIL_BASE_SELECT}, language_code, target_country, answer_summary, key_takeaways, entities_json, sources_json, reviewed_at`.replace(
  /\s+/g,
  ' '
).trim();

const DETAIL_OPTIONAL_COLUMNS = [
  'language_code',
  'target_country',
  'answer_summary',
  'key_takeaways',
  'entities_json',
  'sources_json',
  'reviewed_at',
];

let detailSelectRuntime = null;

const CACHE_TTL_MS = Number(process.env.BLOG_READ_CACHE_MS) || 120_000;
const CACHE_TTL_POPULAR_MS = Number(process.env.BLOG_POPULAR_CACHE_MS) || 300_000;
const CACHE_TTL_DETAIL_MS = Number(process.env.BLOG_DETAIL_CACHE_MS) || 180_000;

const memCache = new Map();
let fulltextAvailable = null;

function cacheGet(key) {
  const hit = memCache.get(key);
  if (!hit || hit.exp <= Date.now()) {
    if (hit) memCache.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key, data, ttlMs) {
  memCache.set(key, { data, exp: Date.now() + ttlMs });
}

function invalidateBlogReadCache() {
  memCache.clear();
  fulltextAvailable = null;
  detailSelectRuntime = null;
}

async function resolveDetailSelect() {
  if (detailSelectRuntime) return detailSelectRuntime;
  let optional = [];
  try {
    const rows = await queryAsync('SHOW COLUMNS FROM blogs');
    const names = new Set((rows || []).map((r) => r.Field));
    optional = DETAIL_OPTIONAL_COLUMNS.filter((c) => names.has(c));
  } catch (_) {
    optional = [];
  }
  detailSelectRuntime =
    optional.length > 0
      ? `${DETAIL_BASE_SELECT}, ${optional.join(', ')}`
      : DETAIL_BASE_SELECT;
  return detailSelectRuntime;
}

function buildOrderSql(order) {
  if (order === 'old') return 'ORDER BY created_at ASC, id ASC';
  if (order === 'alpha') return 'ORDER BY meta_title ASC, id ASC';
  return 'ORDER BY created_at DESC, id DESC';
}

function appendSearchClause(where, params, q) {
  const term = String(q || '').trim();
  if (!term) return;

  const useFt =
    fulltextAvailable !== false &&
    process.env.BLOG_USE_FULLTEXT !== '0' &&
    process.env.BLOG_USE_FULLTEXT !== 'false';

  if (useFt) {
    const tokens = term
      .split(/\s+/)
      .map((t) => t.replace(/[^\w-]/g, ''))
      .filter((t) => t.length >= 2)
      .slice(0, 6);
    if (tokens.length) {
      const boolQuery = tokens.map((t) => `+${t}*`).join(' ');
      where.push(
        `MATCH(title, meta_abstract, tags, meta_keywords) AGAINST (? IN BOOLEAN MODE)`
      );
      params.push(boolQuery);
      return;
    }
  }

  where.push(
    `(title LIKE ? OR meta_title LIKE ? OR meta_description LIKE ? OR meta_abstract LIKE ? OR tags LIKE ? OR meta_keywords LIKE ?)`
  );
  const like = `%${term}%`;
  params.push(like, like, like, like, like, like);
}

async function detectFulltextIndex() {
  if (fulltextAvailable != null) return fulltextAvailable;
  if (process.env.BLOG_USE_FULLTEXT === '0' || process.env.BLOG_USE_FULLTEXT === 'false') {
    fulltextAvailable = false;
    return false;
  }
  try {
    const rows = await queryAsync(`SHOW INDEX FROM blogs WHERE Key_name = 'ft_blog_search'`);
    fulltextAvailable = Array.isArray(rows) && rows.length > 0;
  } catch (_) {
    fulltextAvailable = false;
  }
  return fulltextAvailable;
}

function buildPublicWhere({ q, cat }) {
  const where = [];
  const params = [];
  appendPublicBlogWhere(where, params);
  if (cat) {
    where.push('category = ?');
    params.push(cat);
  }
  appendSearchClause(where, params, q);
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function fetchBlogListing({ q = '', cat = '', order = 'new', page = 1, pageSize = 10 }) {
  await detectFulltextIndex();
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 10, 1), 50);
  const cacheKey = `list:${q}|${cat}|${order}|${safePage}|${limit}|ft:${fulltextAvailable}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const { whereSql, params } = buildPublicWhere({ q, cat });
  const orderSql = buildOrderSql(order);

  const [countRows, popularRows] = await Promise.all([
    queryAsync(`SELECT COUNT(*) AS total FROM blogs ${whereSql}`, params),
    fetchPopularPostsInternal(),
  ]);

  const total = countRows[0]?.total || 0;
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const clampedPage = Math.min(safePage, totalPages);
  const offset = (clampedPage - 1) * limit;

  const listRows = await queryAsync(
    `SELECT ${LIST_SELECT} FROM blogs ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const payload = {
    total,
    totalPages,
    page: clampedPage,
    pageSize: limit,
    rows: filterPublicBlogRows(listRows || [], { leanList: true }),
    popularPosts: popularRows,
  };
  cacheSet(cacheKey, payload, CACHE_TTL_MS);
  return payload;
}

async function fetchPopularPostsInternal() {
  const cacheKey = 'popular:15';
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const where = [];
  const params = [];
  appendPublicBlogWhere(where, params);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await queryAsync(
    `SELECT ${LIST_SELECT} FROM blogs ${whereSql} ORDER BY created_at DESC, id DESC LIMIT 15`,
    params
  );
  const filtered = filterPublicBlogRows(rows || [], { leanList: true });
  cacheSet(cacheKey, filtered, CACHE_TTL_POPULAR_MS);
  return filtered;
}

async function fetchBlogAuthorDisplay(authorId) {
  const id = Number(authorId);
  if (!Number.isFinite(id) || id <= 0) {
    return { type: 'organization', name: 'FileMakr Team' };
  }
  try {
    const rows = await queryAsync(
      'SELECT id, name, status FROM blog_writers WHERE id = ? LIMIT 1',
      [id]
    );
    const w = rows && rows[0];
    if (w && w.status === 'active' && String(w.name || '').trim()) {
      return { type: 'person', name: String(w.name).trim(), writerId: w.id };
    }
  } catch (_) {
    /* blog_writers optional */
  }
  return { type: 'organization', name: 'FileMakr Team' };
}

async function fetchBlogDetailBySlug(slug) {
  const s = String(slug || '').trim();
  if (!s) return null;

  const cacheKey = `detail:${s}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    return cached;
  }

  const detailSelect = await resolveDetailSelect();
  const rows = await queryAsync(
    `SELECT ${detailSelect}
     FROM blogs
     WHERE slug = ?
       AND (status IS NULL OR status = 'published')
     LIMIT 1`,
    [s]
  );
  let post = rows && rows[0] ? rows[0] : null;
  if (!post || !isPublicBlogRow(post)) {
    return null;
  }
  post = hydrateBlogContentFields(post);
  cacheSet(cacheKey, post, CACHE_TTL_DETAIL_MS);
  return post;
}

function patchDetailCacheAuthor(slug, authorDisplay) {
  const s = String(slug || '').trim();
  if (!s || !authorDisplay) return;
  const cacheKey = `detail:${s}`;
  const hit = memCache.get(cacheKey);
  if (hit && hit.data && !hit.data.author_display) {
    hit.data.author_display = authorDisplay;
  }
}

async function fetchRecentPosts({ excludeId = null, excludeSlug = null, limit = 20 }) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 30);
  const where = [];
  const params = [];
  appendPublicBlogWhere(where, params);
  if (excludeId != null) {
    where.push('id <> ?');
    params.push(Number(excludeId));
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const rows = await queryAsync(
    `SELECT ${CARD_SELECT}
     FROM blogs ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [...params, lim]
  );
  return filterPublicBlogRows(rows || [], {
    leanList: true,
    excludeSlug,
    excludeId,
  });
}

async function fetchRelatedPosts({ category, excludeId, limit = 3 }) {
  const cat = String(category || '').trim();
  const lim = Math.min(Math.max(parseInt(limit, 10) || 3, 1), 6);
  if (!cat || /^null$/i.test(cat) || /^all$/i.test(cat)) {
    return [];
  }

  const where = [];
  const params = [];
  appendPublicBlogWhere(where, params);
  where.push('category = ?');
  params.push(cat);
  if (excludeId != null) {
    where.push('id <> ?');
    params.push(Number(excludeId));
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const rows = await queryAsync(
    `SELECT ${CARD_SELECT}
     FROM blogs ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [...params, lim]
  );
  return filterPublicBlogRows(rows || [], { leanList: true, excludeId });
}

async function fetchBlogDetailPage(slug) {
  const post = await fetchBlogDetailBySlug(slug);
  if (!post) return null;

  const authorPromise = post.author_display
    ? Promise.resolve(post.author_display)
    : fetchBlogAuthorDisplay(post.author_id);

  const [authorDisplay, recentBlogs, relatedPosts, popularPosts] = await Promise.all([
    authorPromise,
    fetchRecentPosts({
      excludeId: post.id,
      excludeSlug: post.slug,
      limit: 15,
    }),
    fetchRelatedPosts({
      category: post.category,
      excludeId: post.id,
      limit: 3,
    }),
    fetchPopularPostsInternal(),
  ]);

  if (!post.author_display) {
    post.author_display = authorDisplay;
    patchDetailCacheAuthor(post.slug, authorDisplay);
  }

  let related = relatedPosts.length > 0 ? relatedPosts : [];
  if (!related.length) {
    related = filterPublicBlogRows(recentBlogs || [], {
      leanList: true,
      excludeId: post.id,
    }).slice(0, 3);
  }

  const popularFiltered = filterPublicBlogRows(popularPosts || [], {
    leanList: true,
    excludeId: post.id,
    excludeSlug: post.slug,
  }).slice(0, 8);

  return {
    post,
    recentBlogs,
    relatedPosts: related,
    popularPosts: popularFiltered,
  };
}

/** SQL strings for EXPLAIN scripts (no user input). */
function explainQueryFixtures() {
  const pub = [];
  const pubParams = [];
  appendPublicBlogWhere(pub, pubParams);
  const pubCond = pub.join(' AND ');
  const pubWhere = pubCond ? `WHERE ${pubCond}` : '';
  const pubAnd = pubCond ? `WHERE ${pubCond} AND ` : 'WHERE ';
  return {
    listing: {
      sql: `SELECT ${LIST_SELECT} FROM blogs ${pubWhere} ORDER BY created_at DESC, id DESC LIMIT 10 OFFSET 0`,
      params: pubParams,
    },
    detail: {
      sql: `SELECT ${DETAIL_SELECT} FROM blogs WHERE slug = ? AND (status IS NULL OR status = 'published') LIMIT 1`,
      params: ['example-slug'],
    },
    recent: {
      sql: `SELECT ${CARD_SELECT} FROM blogs ${pubWhere} ORDER BY created_at DESC, id DESC LIMIT 20`,
      params: pubParams,
    },
    related: {
      sql: `SELECT ${CARD_SELECT} FROM blogs ${pubAnd}category = ? AND id <> ? ORDER BY created_at DESC, id DESC LIMIT 3`,
      params: [...pubParams, 'php', 1],
    },
    searchLike: {
      sql: `SELECT ${LIST_SELECT} FROM blogs ${pubAnd}(title LIKE ? OR meta_title LIKE ?) ORDER BY created_at DESC, id DESC LIMIT 10`,
      params: [...pubParams, '%project%', '%project%'],
    },
    searchFulltext: {
      sql: `SELECT ${LIST_SELECT} FROM blogs ${pubAnd}MATCH(title, meta_abstract, tags, meta_keywords) AGAINST (? IN BOOLEAN MODE) ORDER BY created_at DESC, id DESC LIMIT 10`,
      params: [...pubParams, '+project*'],
    },
  };
}

module.exports = {
  LIST_SELECT,
  CARD_SELECT,
  DETAIL_SELECT,
  DETAIL_BASE_SELECT,
  resolveDetailSelect,
  invalidateBlogReadCache,
  fetchBlogListing,
  fetchPopularPostsInternal,
  fetchBlogAuthorDisplay,
  fetchBlogDetailBySlug,
  fetchRecentPosts,
  fetchRelatedPosts,
  fetchBlogDetailPage,
  explainQueryFixtures,
  detectFulltextIndex,
};
