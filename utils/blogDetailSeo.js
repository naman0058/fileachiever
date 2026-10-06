'use strict';

const { normalizeSiteOrigin, sanitizeCanonicalUrl } = require('./canonicalHost');
const { blogPostExcerpt, truncateMetaDescription } = require('../routes/onPageSeo');

function stripHtmlMeta(text) {
  return String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
const { isPlaceholderBlogText, stripBlogText } = require('./blogPublic');
const { isProductionSafeHttpUrl } = require('./blogContentModel');
const { extractFaqMainEntityFromHtml, buildFaqPageNode } = require('./blogFaqSchema');
const { countryAudienceNode } = require('./blogSupplementalSchema');

const ROBOTS_INDEX_ARTICLE =
  'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';

const PUBLISHER_LOGO =
  'https://res.cloudinary.com/dggf8vl9p/image/upload/v1718627756/filemakr-project-file-creator-favicon_1_dqogst.avif';

function toIso8601(value) {
  if (value == null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function expectedBlogCanonical(post, siteOrigin) {
  const origin = normalizeSiteOrigin(siteOrigin).replace(/\/$/, '');
  const slug = String(post.slug || '').trim();
  return `${origin}/blog/${encodeURIComponent(slug)}`;
}

function resolveBlogDetailCanonical(post, siteOrigin) {
  const expected = expectedBlogCanonical(post, siteOrigin);
  const raw = String((post && post.canonical_url) || '').trim();
  if (!raw) return expected;

  const sanitized = sanitizeCanonicalUrl(raw, siteOrigin).replace(/\/$/, '');
  const expectedNorm = expected.replace(/\/$/, '');

  try {
    const u = new URL(sanitized);
    const host = u.hostname.toLowerCase();
    if (host !== 'www.filemakr.com' && host !== 'filemakr.com') {
      return expected;
    }
    const path = u.pathname.replace(/\/$/, '');
    const slug = String(post.slug || '').trim();
    if (path === `/blog/${slug}` || path === `/blog/${encodeURIComponent(slug)}`) {
      return sanitized;
    }
  } catch (_) {
    return expected;
  }
  return expected;
}

function blogDetailHeading(post) {
  const metaTitle = stripHtmlMeta(post && post.meta_title);
  const title = stripHtmlMeta(post && post.title);
  if (metaTitle && !isPlaceholderBlogText(metaTitle)) return metaTitle;
  if (title && !isPlaceholderBlogText(title)) return title;
  return 'Blog Article';
}

function blogDetailDocumentTitle(post) {
  const base = blogDetailHeading(post);
  if (/\|\s*filemakr/i.test(base)) {
    return base.length > 70 ? `${base.slice(0, 67).trim()}…` : base;
  }
  const suffix = ' | FileMakr';
  if (`${base}${suffix}`.length <= 70) return `${base}${suffix}`;
  const trimmed = base.slice(0, Math.max(20, 70 - suffix.length - 1)).trim();
  return `${trimmed}…${suffix}`;
}

function blogDetailDescription(post) {
  const candidates = [
    post && post.meta_description,
    post && post.meta_abstract,
  ];
  for (const raw of candidates) {
    const text = stripHtmlMeta(raw);
    if (text && !isPlaceholderBlogText(text)) {
      return truncateMetaDescription(text, 160);
    }
  }
  return truncateMetaDescription(blogPostExcerpt(post, 160));
}

function parseTags(post) {
  return String((post && post.tags) || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function countWords(html) {
  const text = stripBlogText(html);
  if (!text) return null;
  return text.split(/\s+/).filter(Boolean).length;
}

/** Types that trigger app/product rich-result validators without full fields. */
const ENTITY_JSONLD_RISKY_TYPES = new Set(['SoftwareApplication', 'Product', 'MobileApplication']);

function schemaEntityJsonLdType(storedType) {
  const t = String(storedType || 'Thing').trim();
  if (ENTITY_JSONLD_RISKY_TYPES.has(t)) return 'Thing';
  return t || 'Thing';
}

function schemaAuthorNode(authorDisplay, origin) {
  if (authorDisplay && authorDisplay.type === 'person' && authorDisplay.name) {
    return {
      '@type': 'Person',
      name: authorDisplay.name,
      url: `${origin}/blog`,
      affiliation: {
        '@type': 'Organization',
        name: 'FileMakr',
        url: `${origin}/`,
      },
    };
  }
  return {
    '@type': 'Organization',
    name: 'FileMakr Team',
    url: `${origin}/`,
  };
}

function entitySchemaNodes(entities) {
  if (!Array.isArray(entities) || !entities.length) return { about: null, mentions: null };
  const seen = new Set();
  const nodes = [];
  for (const e of entities) {
    if (!e || !e.name) continue;
    const name = String(e.name).trim();
    const sameAsRaw = e.sameAs && String(e.sameAs).trim();
    const sameAs =
      sameAsRaw && isProductionSafeHttpUrl(sameAsRaw) ? sameAsRaw : '';
    const dedupeKey = `${name.toLowerCase()}|${sameAs}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const node = {
      '@type': schemaEntityJsonLdType(e.type),
      name,
    };
    if (sameAs) node.sameAs = sameAs;
    nodes.push(node);
  }
  if (!nodes.length) return { about: null, mentions: null };
  return {
    about: nodes.length <= 5 ? nodes : nodes.slice(0, 5),
    mentions: nodes,
  };
}

const DUPLICATE_ROOT_TYPES = new Set([
  'BlogPosting',
  'Article',
  'NewsArticle',
  'FAQPage',
  'BreadcrumbList',
  'WebPage',
]);

function mergeCustomSchemaMarkup(builtGraph, rawMarkup) {
  if (!rawMarkup || !String(rawMarkup).trim()) return builtGraph;
  let parsed;
  try {
    parsed = JSON.parse(String(rawMarkup).trim());
  } catch (_) {
    return builtGraph;
  }

  const extras = [];
  const absorb = (node) => {
    if (!node || typeof node !== 'object') return;
    const t = node['@type'];
    const types = Array.isArray(t) ? t : [t];
    if (types.some((x) => DUPLICATE_ROOT_TYPES.has(x))) return;
    extras.push(node);
  };

  if (Array.isArray(parsed['@graph'])) {
    parsed['@graph'].forEach(absorb);
  } else if (parsed['@type']) {
    absorb(parsed);
  }

  if (!extras.length) return builtGraph;
  return {
    '@context': 'https://schema.org',
    '@graph': [...builtGraph['@graph'], ...extras],
  };
}

function buildBlogDetailJsonLd(post, options = {}) {
  const siteOrigin = normalizeSiteOrigin(options.siteOrigin || 'https://www.filemakr.com');
  const origin = siteOrigin.replace(/\/$/, '');
  const canonical = options.canonicalUrl || expectedBlogCanonical(post, siteOrigin);
  const heading = options.displayTitle || blogDetailHeading(post);
  const description = options.description || blogDetailDescription(post);
  const imageUrl = String((post && post.thumbnail_url) || '').trim() || null;
  const published = toIso8601(post.created_at);
  const modified = toIso8601(post.updated_at || post.reviewed_at || post.created_at);
  const wordCount = countWords(post.content);
  const tags = parseTags(post);
  const entities = Array.isArray(post.entities_json) ? post.entities_json : [];
  const { about, mentions } = entitySchemaNodes(entities);
  const section = post.category
    ? String(post.category).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  const keywords = [post.focus_keyword, post.meta_keywords, tags.join(', ')]
    .map((v) => stripHtmlMeta(v))
    .filter(Boolean)
    .join(', ')
    .trim();

  const blogPosting = {
    '@type': 'BlogPosting',
    '@id': `${canonical}#article`,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonical,
    },
    url: canonical,
    headline: heading,
    description,
    isAccessibleForFree: true,
    inLanguage: post.language_code || 'en-US',
    author: schemaAuthorNode(options.authorDisplay, origin),
    publisher: {
      '@type': 'Organization',
      name: 'FileMakr',
      url: `${origin}/`,
      logo: {
        '@type': 'ImageObject',
        url: PUBLISHER_LOGO,
      },
    },
  };

  if (imageUrl) {
    blogPosting.image = {
      '@type': 'ImageObject',
      url: imageUrl,
    };
  }
  if (published) blogPosting.datePublished = published;
  if (modified) blogPosting.dateModified = modified;
  if (section && section !== 'All') blogPosting.articleSection = section;
  if (keywords) blogPosting.keywords = keywords;
  if (wordCount) blogPosting.wordCount = wordCount;
  if (post.answer_summary && String(post.answer_summary).trim()) {
    blogPosting.abstract = stripBlogText(post.answer_summary);
  }
  if (about) blogPosting.about = about.length === 1 ? about[0] : about;
  if (mentions && mentions.length) blogPosting.mentions = mentions;

  const audience = countryAudienceNode(post.target_country);
  if (audience) blogPosting.audience = audience;

  const breadcrumbs = {
    '@type': 'BreadcrumbList',
    itemListElement: [
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
      {
        '@type': 'ListItem',
        position: 3,
        name: heading,
        item: canonical,
      },
    ],
  };

  const graphNodes = [blogPosting, breadcrumbs];

  const faqMainEntity = extractFaqMainEntityFromHtml(post.content);
  const faqNode = buildFaqPageNode(canonical, faqMainEntity);
  if (faqNode) graphNodes.push(faqNode);

  let graph = {
    '@context': 'https://schema.org',
    '@graph': graphNodes,
  };

  graph = mergeCustomSchemaMarkup(graph, post.schema_markup);
  return graph;
}

function blogDetailMetaTags(post, canonicalUrl, options = {}) {
  const heading = blogDetailHeading(post);
  const description = blogDetailDescription(post);
  const published = toIso8601(post.created_at);
  const modified = toIso8601(post.updated_at);
  const reviewed = toIso8601(post.reviewed_at);
  const tags = parseTags(post);
  const section = post.category
    ? String(post.category).replace(/[-_]+/g, ' ').trim()
    : '';

  return {
    title: blogDetailDocumentTitle(post),
    description,
    abstract: truncateMetaDescription(description, 200),
    author: 'https://www.filemakr.com',
    url: canonicalUrl,
    robots: ROBOTS_INDEX_ARTICLE,
    includeMetaKeywords: false,
    htmlLang: post.language_code || 'en-US',
    ogLocale: (post.language_code || 'en-US').replace('-', '_'),
    ogType: 'article',
    ogImage: String(post.thumbnail_url || '').trim(),
    ogImageAlt: `${heading} on FileMakr Blog`,
    displayTitle: heading,
    articlePublishedTime: published,
    articleModifiedTime: modified || published,
    articleReviewedTime: reviewed,
    articleSection: section,
    articleTags: tags,
  };
}

module.exports = {
  ROBOTS_INDEX_ARTICLE,
  resolveBlogDetailCanonical,
  expectedBlogCanonical,
  blogDetailHeading,
  blogDetailDocumentTitle,
  blogDetailDescription,
  blogDetailMetaTags,
  buildBlogDetailJsonLd,
  toIso8601,
  mergeCustomSchemaMarkup,
  schemaEntityJsonLdType,
};
