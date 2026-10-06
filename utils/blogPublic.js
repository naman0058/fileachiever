'use strict';

/**
 * Public blog listing/detail guards (automate_blog.blogs).
 * Keeps drafts, placeholders and broken rows off the site and sitemap.
 */

const PLACEHOLDER_TITLE_PATTERNS = [
  /replace_with_article_title/i,
  /your seo title/i,
  /add your (meta )?title/i,
  /\[add your/i,
  /sample blog post/i,
  /^untitled$/i,
  /^test$/i,
  /^lorem ipsum$/i,
  /^blog post title$/i,
  /^article title$/i,
];

function stripBlogText(v) {
  return String(v || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPlaceholderBlogText(text) {
  const t = stripBlogText(text);
  if (!t) return true;
  if (t.length < 3) return true;
  return PLACEHOLDER_TITLE_PATTERNS.some((re) => re.test(t));
}

function isValidBlogSlug(slug) {
  const s = String(slug || '').trim();
  if (!s || s.length > 200) return false;
  if (/^null$/i.test(s)) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(s);
}

function isPublishedStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  if (!s) return true; // legacy rows before status column
  return s === 'published';
}

function hasMinContent(row) {
  const content = stripBlogText(row && row.content);
  const meta = stripBlogText(row && row.meta_description);
  const abstract = stripBlogText(row && row.meta_abstract);
  if (content.length >= 40) return true;
  if (meta.length >= 20) return true;
  if (abstract.length >= 20) return true;
  return false;
}

function isPublicBlogRow(row, options) {
  if (!row || typeof row !== 'object') return false;
  if (!isValidBlogSlug(row.slug)) return false;
  if (!isPublishedStatus(row.status)) return false;

  const title = stripBlogText(row.title);
  const metaTitle = stripBlogText(row.meta_title);
  const heading = title || metaTitle;
  if (!heading || isPlaceholderBlogText(heading)) return false;
  if (title && isPlaceholderBlogText(title)) return false;
  if (metaTitle && isPlaceholderBlogText(metaTitle)) return false;

  if (options && options.leanList) {
    const meta = stripBlogText(row.meta_description);
    const abstract = stripBlogText(row.meta_abstract);
    return meta.length >= 10 || abstract.length >= 10 || Boolean(title);
  }

  return hasMinContent(row);
}

/** SQL fragment (no leading WHERE) — append after WHERE or with AND. */
function blogPublicSqlConditions(columnPrefix) {
  const p = columnPrefix ? `${columnPrefix}.` : '';
  return {
    sql: `(${p}slug IS NOT NULL AND TRIM(${p}slug) <> '' AND (${p}status IS NULL OR ${p}status = 'published') AND ${p}title IS NOT NULL AND TRIM(${p}title) <> '' AND ${p}title NOT LIKE ? AND ${p}title NOT LIKE ? AND LOWER(TRIM(${p}title)) NOT IN ('test','untitled','lorem ipsum') AND (${p}meta_title IS NULL OR (${p}meta_title NOT LIKE ? AND ${p}meta_title NOT LIKE ?)))`,
    params: ['%REPLACE_WITH_ARTICLE_TITLE%', '%YOUR SEO TITLE%', '%REPLACE_WITH_ARTICLE_TITLE%', '%YOUR SEO TITLE%'],
  };
}

function appendPublicBlogWhere(existingWhereParts, params, columnPrefix) {
  const cond = blogPublicSqlConditions(columnPrefix);
  existingWhereParts.push(cond.sql);
  params.push(...cond.params);
}

function filterPublicBlogRows(rows, options) {
  const list = Array.isArray(rows) ? rows : [];
  const excludeSlug = options && options.excludeSlug ? String(options.excludeSlug).trim() : '';
  const excludeId = options && options.excludeId != null ? Number(options.excludeId) : null;
  const leanList = !!(options && options.leanList);
  return list.filter((row) => {
    if (!isPublicBlogRow(row, { leanList })) return false;
    if (excludeSlug && String(row.slug || '').trim() === excludeSlug) return false;
    if (excludeId != null && Number(row.id) === excludeId) return false;
    return true;
  });
}

function normalizeReadingMinutes(value, fallbackHtml) {
  if (value != null && value !== '') {
    const raw = String(value).trim();
    const digits = parseInt(raw.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(digits) && digits > 0 && digits < 500) return digits;
  }
  const text = stripBlogText(fallbackHtml);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (!words) return null;
  return Math.max(1, Math.ceil(words / 200));
}

module.exports = {
  stripBlogText,
  isPlaceholderBlogText,
  isValidBlogSlug,
  isPublishedStatus,
  isPublicBlogRow,
  blogPublicSqlConditions,
  appendPublicBlogWhere,
  filterPublicBlogRows,
  normalizeReadingMinutes,
};
