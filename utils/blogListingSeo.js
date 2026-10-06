'use strict';

const { normalizeSiteOrigin } = require('./canonicalHost');
const { blogPostHeading, truncateMetaDescription } = require('../routes/onPageSeo');

const BLOG_INDEX_PATH = '/blog';
const ROBOTS_INDEX_FULL =
  'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
const ROBOTS_NOINDEX_FOLLOW = 'noindex,follow';

const ALLOWED_QUERY_KEYS = new Set(['page', 'category', 'sort', 'q', 'tag']);

function blogIndexUrl(siteOrigin) {
  return `${normalizeSiteOrigin(siteOrigin).replace(/\/$/, '')}${BLOG_INDEX_PATH}`;
}

function buildBlogListingCanonical({ q, cat, page, siteOrigin }) {
  const base = blogIndexUrl(siteOrigin);
  if (q) return base;

  const params = new URLSearchParams();
  if (cat) params.set('category', cat);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

function analyzeBlogListingQuery(rawQuery) {
  const q = String((rawQuery && rawQuery.q) || (rawQuery && rawQuery.tag) || '')
    .trim()
    .slice(0, 100);
  const cat = String((rawQuery && rawQuery.category) || '').trim().slice(0, 80);
  const sort = String((rawQuery && rawQuery.sort) || 'new').trim() || 'new';
  const page = Math.max(1, parseInt(rawQuery && rawQuery.page, 10) || 1);

  const unknownKeys = Object.keys(rawQuery || {}).filter((k) => !ALLOWED_QUERY_KEYS.has(k));
  const isSearch = !!q;
  const nonDefaultSort = sort !== 'new';
  const hasUnknownParams = unknownKeys.length > 0;
  const noindex = isSearch || nonDefaultSort || hasUnknownParams;

  return {
    q,
    cat,
    sort,
    page,
    isSearch,
    noindex,
    nonDefaultSort,
    hasUnknownParams,
    unknownKeys,
  };
}

function buildBlogListingPageUrl(siteOrigin, queryState, pageNum) {
  const base = blogIndexUrl(siteOrigin);
  const params = new URLSearchParams();
  if (queryState.cat && !queryState.isSearch) params.set('category', queryState.cat);
  if (queryState.isSearch && queryState.q) params.set('q', queryState.q);
  if (pageNum > 1) params.set('page', String(pageNum));
  if (queryState.nonDefaultSort && queryState.sort) params.set('sort', queryState.sort);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

function buildBlogListingJsonLd({ posts, canonicalUrl, page, siteOrigin }) {
  const origin = normalizeSiteOrigin(siteOrigin).replace(/\/$/, '');
  const visible = (posts || []).filter((p) => p && p.slug);

  const itemListElement = visible.map((post, idx) => ({
    '@type': 'ListItem',
    position: idx + 1,
    name: blogPostHeading(post),
    url: `${origin}/blog/${encodeURIComponent(String(post.slug).trim())}`,
  }));

  const breadcrumbItems = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: `${origin}/`,
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Blog',
      item: `${origin}/blog`,
    },
  ];
  if (page > 1) {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 3,
      name: `Page ${page}`,
      item: canonicalUrl,
    });
  }

  const graph = [
    {
      '@type': 'CollectionPage',
      '@id': `${canonicalUrl}#webpage`,
      url: canonicalUrl,
      name: page > 1 ? `FileMakr Blog — Page ${page}` : 'FileMakr Blog',
      description:
        'Guides and tutorials on final-year projects, programming, reports, and student career skills.',
      inLanguage: 'en-US',
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems,
    },
  ];

  if (itemListElement.length) {
    graph.push({
      '@type': 'ItemList',
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      numberOfItems: itemListElement.length,
      itemListElement,
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}

function blogListingMetaTags(canonicalUrl, queryState, siteOrigin) {
  const { q, cat, page, noindex, isSearch } = queryState;
  const baseTitle = 'FileMakr Blog — Project Guides, Tutorials & Student Resources';
  const baseDescription =
    'In-depth guides on final-year projects, programming tutorials, academic report writing, and career skills for computer science and engineering students.';

  let title = baseTitle;
  let description = baseDescription;

  if (isSearch && q) {
    title = `Blog search: ${truncateMetaDescription(q, 48).replace(/…$/, '')} | FileMakr`;
    description = truncateMetaDescription(
      `Browse FileMakr Blog articles matching “${q}”. Guides and tutorials for students.`
    );
  } else if (cat) {
    const label = cat.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    title = `${label} — FileMakr Blog`;
    description = truncateMetaDescription(
      `${label} articles, tutorials, and project tips on FileMakr Blog for engineering and CS students.`
    );
  } else if (page > 1) {
    title = `FileMakr Blog — Page ${page}`;
    description = truncateMetaDescription(baseDescription);
  }

  const defaultOg =
    'https://res.cloudinary.com/npuap6la/image/upload/v1787657312/Untitled_4.webp';

  return {
    title,
    description: truncateMetaDescription(description),
    author: 'https://www.filemakr.com',
    abstract: truncateMetaDescription(description, 200),
    url: canonicalUrl,
    robots: noindex ? ROBOTS_NOINDEX_FOLLOW : ROBOTS_INDEX_FULL,
    includeMetaKeywords: false,
    htmlLang: 'en-US',
    ogLocale: 'en_US',
    ogImage: defaultOg,
    ogImageAlt: 'FileMakr Blog — project guides and student resources',
    isSearch,
  };
}

module.exports = {
  BLOG_INDEX_PATH,
  ROBOTS_INDEX_FULL,
  ROBOTS_NOINDEX_FOLLOW,
  blogIndexUrl,
  buildBlogListingCanonical,
  analyzeBlogListingQuery,
  buildBlogListingPageUrl,
  buildBlogListingJsonLd,
  blogListingMetaTags,
};
