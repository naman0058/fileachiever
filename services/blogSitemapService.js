'use strict';

const util = require('util');
const pool2 = require('../routes/pool2');
const { blogPublicSqlConditions, filterPublicBlogRows, isValidBlogSlug } = require('../utils/blogPublic');
const { normalizeSiteOrigin } = require('../utils/canonicalHost');
const { blogPostExcerpt, blogPostHeading } = require('../routes/onPageSeo');

const queryAsync = util.promisify(pool2.query).bind(pool2);

const SITE_BASE = normalizeSiteOrigin(process.env.SITE_BASE_URL || 'https://www.filemakr.com').replace(
  /\/$/,
  ''
);

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatLastmod(row) {
  const raw = row.updated_at || row.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function blogCanonicalLoc(slug) {
  const s = String(slug || '').trim();
  if (!isValidBlogSlug(s)) return null;
  return `${SITE_BASE}/blog/${encodeURIComponent(s)}`;
}

async function fetchPublicBlogSitemapRows({ limit = 5000 } = {}) {
  const pub = blogPublicSqlConditions('');
  const lim = Math.min(Math.max(parseInt(limit, 10) || 5000, 1), 10000);
  const rows = await queryAsync(
    `SELECT slug, title, meta_title, meta_description, meta_abstract, content, status,
            created_at, updated_at, author_id
     FROM blogs
     WHERE ${pub.sql}
     ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
     LIMIT ?`,
    [...pub.params, lim]
  );
  const filtered = filterPublicBlogRows(rows || []);
  const seen = new Set();
  const out = [];
  for (const row of filtered) {
    const slug = String(row.slug || '').trim();
    if (!slug || seen.has(slug)) continue;
    const loc = blogCanonicalLoc(slug);
    if (!loc) continue;
    seen.add(slug);
    out.push({
      slug,
      loc,
      lastmod: formatLastmod(row),
      row,
    });
  }
  return out;
}

function buildBlogSitemapXml(entries) {
  const urls = (entries || [])
    .map((e) => {
      const lastmod = e.lastmod ? `<lastmod>${escapeXml(e.lastmod)}</lastmod>` : '';
      return `<url><loc>${escapeXml(e.loc)}</loc>${lastmod}<priority>0.64</priority></url>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls +
    '</urlset>'
  );
}

function buildBlogRssXml(entries, channelMeta = {}) {
  const title = channelMeta.title || 'FileMakr Blog';
  const link = channelMeta.link || `${SITE_BASE}/blog`;
  const description =
    channelMeta.description ||
    'Guides and tutorials on final-year projects, programming, and student resources.';

  const items = (entries || [])
    .slice(0, 30)
    .map((e) => {
      const post = e.row || {};
      const itemTitle = escapeXml(blogPostHeading(post));
      const itemLink = escapeXml(e.loc);
      const pubDate = post.created_at ? new Date(post.created_at).toUTCString() : '';
      const desc = escapeXml(blogPostExcerpt(post, 300));
      const guid = itemLink;
      return (
        '<item>' +
        `<title>${itemTitle}</title>` +
        `<link>${itemLink}</link>` +
        `<guid isPermaLink="true">${guid}</guid>` +
        (pubDate ? `<pubDate>${escapeXml(pubDate)}</pubDate>` : '') +
        `<description>${desc}</description>` +
        '</item>'
      );
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">' +
    '<channel>' +
    `<title>${escapeXml(title)}</title>` +
    `<link>${escapeXml(link)}</link>` +
    `<description>${escapeXml(description)}</description>` +
    `<atom:link href="${escapeXml(`${link}/feed.xml`)}" rel="self" type="application/rss+xml"/>` +
    items +
    '</channel></rss>'
  );
}

module.exports = {
  SITE_BASE,
  escapeXml,
  fetchPublicBlogSitemapRows,
  buildBlogSitemapXml,
  buildBlogRssXml,
  blogCanonicalLoc,
};
