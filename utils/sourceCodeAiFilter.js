'use strict';

/**
 * /source-code/ai — only projects whose title (name) reads as AI-branded:
 * "Smart AI", "AI Based", "AI-Based" (not general ML / machine-learning category).
 */
const AI_TITLE_LIKE_PATTERNS = ['%smart ai%', '%ai based%', '%ai-based%'];

function buildAiSourceCodeWhere() {
  const params = [];
  const titleHaystack = 'LOWER(COALESCE(name, \'\'))';
  const parts = AI_TITLE_LIKE_PATTERNS.map((pattern) => {
    params.push(pattern);
    return `${titleHaystack} LIKE ?`;
  });
  return {
    whereSql: parts.join(' OR '),
    params,
  };
}

module.exports = {
  AI_TITLE_LIKE_PATTERNS,
  buildAiSourceCodeWhere,
};
