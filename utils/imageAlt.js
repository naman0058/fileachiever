/**
 * Build accessible alt text for product / blog / project images.
 * HTML-escaped for use in EJS attribute values.
 */
function imageAltLabel(name, suffix) {
  const base = String(name || '').trim() || 'Project';
  const text = suffix ? `${base} ${suffix}` : base;
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .trim();
}

module.exports = { imageAltLabel };
