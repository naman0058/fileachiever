'use strict';

/**
 * Editorial / AEO content fields for automate_blog.blogs.
 * Nullable-safe: existing rows work when all new fields are NULL.
 */

const ENTITY_TYPES = new Set([
  'Thing',
  'SoftwareApplication',
  'Organization',
  'EducationalOccupationalProgram',
  'Person',
  'DefinedTerm',
]);

const DEFAULT_LANGUAGE_CODE = 'en-US';
const DEFAULT_TARGET_COUNTRY = 'US';

const LANGUAGE_CODES = new Set(['en-US', 'en-GB', 'en-IN', 'en']);
const TARGET_COUNTRIES = new Set(['US', 'IN', 'GB', 'CA', 'AU', 'DE', 'SG']);

function stripHtml(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(text) {
  const t = stripHtml(text);
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function parseJsonArrayField(raw, label) {
  if (raw == null || raw === '') return { ok: true, value: null };
  if (Array.isArray(raw)) return { ok: true, value: raw };
  if (typeof raw === 'object') return { ok: true, value: raw };
  const s = String(raw).trim();
  if (!s) return { ok: true, value: null };
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed)) {
      return { ok: false, msg: `${label} must be a JSON array.` };
    }
    return { ok: true, value: parsed };
  } catch (_) {
    return { ok: false, msg: `${label} must be valid JSON.` };
  }
}

function parseTakeawaysField(raw) {
  if (raw == null || raw === '') return { ok: true, value: null };
  if (Array.isArray(raw)) {
    return validateKeyTakeaways(raw);
  }
  const s = String(raw).trim();
  if (!s) return { ok: true, value: null };
  if (s.startsWith('[')) {
    const parsed = parseJsonArrayField(s, 'Key takeaways');
    if (!parsed.ok) return parsed;
    return validateKeyTakeaways(parsed.value);
  }
  const lines = s
    .split(/\r?\n/)
    .map((l) => stripHtml(l))
    .filter(Boolean);
  return validateKeyTakeaways(lines);
}

function isValidHttpUrl(url) {
  try {
    const u = new URL(String(url).trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (_) {
    return false;
  }
}

const BLOCKED_URL_HOSTS = new Set([
  'example.com',
  'www.example.com',
  'example.org',
  'www.example.org',
  'example.net',
  'localhost',
  '127.0.0.1',
]);

/** Public-facing links (entities, sources, schema sameAs). */
function isProductionSafeHttpUrl(url) {
  if (!isValidHttpUrl(url)) return false;
  try {
    const host = new URL(String(url).trim()).hostname.toLowerCase();
    if (BLOCKED_URL_HOSTS.has(host)) return false;
    if (host.endsWith('.example.com') || host.endsWith('.example.org')) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function validateLanguageCode(code) {
  const c = String(code || '').trim() || DEFAULT_LANGUAGE_CODE;
  if (!LANGUAGE_CODES.has(c)) {
    return { ok: false, msg: `Unsupported language_code: ${c}` };
  }
  return { ok: true, value: c };
}

function validateTargetCountry(country) {
  const c = String(country || '').trim().toUpperCase() || DEFAULT_TARGET_COUNTRY;
  if (!/^[A-Z]{2}$/.test(c)) {
    return { ok: false, msg: 'target_country must be a 2-letter ISO code.' };
  }
  if (!TARGET_COUNTRIES.has(c)) {
    return { ok: false, msg: `Unsupported target_country: ${c}` };
  }
  return { ok: true, value: c };
}

function validateAnswerSummary(text) {
  const t = stripHtml(text);
  if (!t) return { ok: true, value: null };
  const wc = wordCount(t);
  if (wc < 25) {
    return { ok: false, msg: 'Answer summary should be at least ~25 words when provided (target 40–90).' };
  }
  if (wc > 150) {
    return { ok: false, msg: 'Answer summary is too long (max ~150 words).' };
  }
  return { ok: true, value: t };
}

function validateKeyTakeaways(items) {
  if (items == null) return { ok: true, value: null };
  if (!Array.isArray(items)) {
    return { ok: false, msg: 'Key takeaways must be an array.' };
  }
  const cleaned = items
    .map((item) => {
      if (typeof item === 'string') return stripHtml(item);
      if (item && typeof item === 'object' && item.text) return stripHtml(item.text);
      return '';
    })
    .filter(Boolean);
  if (!cleaned.length) return { ok: true, value: null };
  if (cleaned.length < 3 || cleaned.length > 7) {
    return { ok: false, msg: 'Provide 3–7 key takeaways when using this section.' };
  }
  for (const line of cleaned) {
    if (line.length > 500) {
      return { ok: false, msg: 'Each takeaway must be concise (max 500 characters).' };
    }
  }
  return { ok: true, value: cleaned };
}

function validateEntities(items) {
  if (items == null) return { ok: true, value: null };
  if (!Array.isArray(items)) {
    return { ok: false, msg: 'entities_json must be an array.' };
  }
  if (!items.length) return { ok: true, value: null };

  const out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      return { ok: false, msg: 'Each entity must be an object with name and type.' };
    }
    const name = stripHtml(item.name);
    const type = String(item.type || '').trim();
    if (!name) {
      return { ok: false, msg: 'Each entity requires a name.' };
    }
    if (!ENTITY_TYPES.has(type)) {
      return { ok: false, msg: `Invalid entity type for "${name}".` };
    }
    const row = { name, type };
    if (item.sameAs != null && String(item.sameAs).trim()) {
      const sameAs = String(item.sameAs).trim();
      if (!isProductionSafeHttpUrl(sameAs)) {
        return { ok: false, msg: `Entity "${name}": sameAs must be a valid public http(s) URL.` };
      }
      row.sameAs = sameAs;
    }
    out.push(row);
  }
  return { ok: true, value: out };
}

function validateSources(items) {
  if (items == null) return { ok: true, value: null };
  if (!Array.isArray(items)) {
    return { ok: false, msg: 'sources_json must be an array.' };
  }
  if (!items.length) return { ok: true, value: null };

  const out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      return { ok: false, msg: 'Each source must be an object.' };
    }
    const title = stripHtml(item.title);
    const url = String(item.url || '').trim();
    if (!title || !url) {
      return { ok: false, msg: 'Each source requires title and url.' };
    }
    if (!isProductionSafeHttpUrl(url)) {
      return { ok: false, msg: `Source "${title}": url must be a valid public http(s) URL.` };
    }
    const row = { title, url };
    if (item.publisher != null && String(item.publisher).trim()) {
      row.publisher = stripHtml(item.publisher);
    }
    if (item.accessed_at != null && String(item.accessed_at).trim()) {
      const d = String(item.accessed_at).trim();
      if (Number.isNaN(Date.parse(d))) {
        return { ok: false, msg: `Source "${title}": accessed_at must be a valid date.` };
      }
      row.accessed_at = d;
    }
    out.push(row);
  }
  return { ok: true, value: out };
}

/** Serialize array/object for DB (JSON column or LONGTEXT). */
function serializeJsonColumn(value) {
  if (value == null) return null;
  return JSON.stringify(value);
}

function parseStoredJson(value) {
  if (value == null || value === '') return null;
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return value;
  }
  try {
    return JSON.parse(String(value));
  } catch (_) {
    return null;
  }
}

/**
 * Validate writer/admin POST body; returns { ok, msg?, data? }.
 */
function validateBlogContentPayload(body) {
  const lang = validateLanguageCode(body.language_code);
  if (!lang.ok) return lang;

  const country = validateTargetCountry(body.target_country);
  if (!country.ok) return country;

  const answer = validateAnswerSummary(body.answer_summary);
  if (!answer.ok) return answer;

  const takeaways = parseTakeawaysField(body.key_takeaways);
  if (!takeaways.ok) return takeaways;

  const entitiesRaw = parseJsonArrayField(body.entities_json, 'entities_json');
  if (!entitiesRaw.ok) return entitiesRaw;
  const entities = validateEntities(entitiesRaw.value);
  if (!entities.ok) return entities;

  const sourcesRaw = parseJsonArrayField(body.sources_json, 'sources_json');
  if (!sourcesRaw.ok) return sourcesRaw;
  const sources = validateSources(sourcesRaw.value);
  if (!sources.ok) return sources;

  let reviewedAt = null;
  if (body.mark_content_reviewed === '1' || body.mark_content_reviewed === true) {
    reviewedAt = new Date();
  } else if (body.preserve_reviewed_at === '1' && body.existing_reviewed_at) {
    const d = new Date(body.existing_reviewed_at);
    if (!Number.isNaN(d.getTime())) reviewedAt = d;
  }

  return {
    ok: true,
    data: {
      language_code: lang.value,
      target_country: country.value,
      answer_summary: answer.value,
      key_takeaways: takeaways.value,
      entities_json: entities.value,
      sources_json: sources.value,
      reviewed_at: reviewedAt,
      mark_reviewed: body.mark_content_reviewed === '1' || body.mark_content_reviewed === true,
    },
  };
}

/** Attach parsed arrays on a blog row for templates and APIs. */
function hydrateBlogContentFields(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  out.language_code = out.language_code || DEFAULT_LANGUAGE_CODE;
  out.target_country = out.target_country || DEFAULT_TARGET_COUNTRY;
  out.key_takeaways = parseStoredJson(out.key_takeaways);
  out.entities_json = parseStoredJson(out.entities_json);
  out.sources_json = parseStoredJson(out.sources_json);
  return out;
}

/** Public JSON shape (no raw HTML content unless includeContent). */
function serializeBlogPostPublic(post, options = {}) {
  const hydrated = hydrateBlogContentFields(post);
  const base = {
    id: hydrated.id,
    slug: hydrated.slug,
    title: hydrated.title,
    meta_title: hydrated.meta_title,
    meta_description: hydrated.meta_description,
    meta_abstract: hydrated.meta_abstract,
    category: hydrated.category,
    thumbnail_url: hydrated.thumbnail_url,
    tags: hydrated.tags,
    focus_keyword: hydrated.focus_keyword,
    canonical_url: hydrated.canonical_url,
    reading_time_minutes: hydrated.reading_time_minutes,
    created_at: hydrated.created_at,
    updated_at: hydrated.updated_at,
    language_code: hydrated.language_code,
    target_country: hydrated.target_country,
    answer_summary: hydrated.answer_summary || null,
    key_takeaways: hydrated.key_takeaways || null,
    entities: hydrated.entities_json || null,
    sources: hydrated.sources_json || null,
    reviewed_at: hydrated.reviewed_at || null,
  };
  if (options.includeContent) {
    base.content = hydrated.content || null;
    base.schema_markup = hydrated.schema_markup || null;
  }
  return base;
}

function htmlLangFromCode(languageCode) {
  const c = String(languageCode || DEFAULT_LANGUAGE_CODE);
  const primary = c.split('-')[0];
  return primary || 'en';
}

module.exports = {
  ENTITY_TYPES,
  DEFAULT_LANGUAGE_CODE,
  DEFAULT_TARGET_COUNTRY,
  LANGUAGE_CODES,
  TARGET_COUNTRIES,
  stripHtml,
  wordCount,
  validateBlogContentPayload,
  hydrateBlogContentFields,
  serializeBlogPostPublic,
  serializeJsonColumn,
  parseStoredJson,
  htmlLangFromCode,
  isProductionSafeHttpUrl,
};
