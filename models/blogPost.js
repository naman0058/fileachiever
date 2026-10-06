'use strict';

/**
 * Blog post entity field definitions (automate_blog.blogs).
 * Persistence uses raw SQL via pool2; this module is the shared schema contract.
 */

const {
  DEFAULT_LANGUAGE_CODE,
  DEFAULT_TARGET_COUNTRY,
  ENTITY_TYPES,
  LANGUAGE_CODES,
  TARGET_COUNTRIES,
  hydrateBlogContentFields,
  serializeBlogPostPublic,
  validateBlogContentPayload,
} = require('../utils/blogContentModel');

const BLOG_CONTENT_MODEL_COLUMNS = [
  'language_code',
  'target_country',
  'answer_summary',
  'key_takeaways',
  'entities_json',
  'sources_json',
  'reviewed_at',
];

module.exports = {
  BLOG_CONTENT_MODEL_COLUMNS,
  DEFAULT_LANGUAGE_CODE,
  DEFAULT_TARGET_COUNTRY,
  ENTITY_TYPES,
  LANGUAGE_CODES,
  TARGET_COUNTRIES,
  hydrateBlogContentFields,
  serializeBlogPostPublic,
  validateBlogContentPayload,
};
