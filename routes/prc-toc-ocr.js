/**
 * Table of contents from an image without cloud AI: Tesseract OCR + line heuristics.
 * Handles both "1 Introduction" thesis style and INDEX tables (S.NO. | NAME | PAGE NO.).
 */

const Tesseract = require('tesseract.js');

const JUNK_TITLES = new Set([
  'name',
  'page',
  'remark',
  'index',
  'contents',
  's.no',
  's no',
  'page no',
  'chapter',
  'title',
  'serial',
  'no',
  'no.',
  'sr',
  'sr.'
]);

/**
 * @param {Buffer} buffer - image bytes (jpeg/png/webp/gif)
 * @returns {Promise<string>} raw OCR text
 */
async function ocrImageToText(buffer) {
  const { data } = await Tesseract.recognize(buffer, 'eng', {
    logger: () => {}
  });
  return (data && data.text) ? String(data.text) : '';
}

/** Remove trailing page column (single page or range). */
function stripTrailingPageNumbers(line) {
  return String(line)
    .replace(/\s+\d{1,3}\s*[-–—]\s*\d{1,3}\s*$/u, '')
    .replace(/\s+\d{1,4}\s*$/u, '')
    .trim();
}

function isGarbageTitle(raw) {
  const t = (raw || '').trim();
  if (t.length < 2) return true;
  if (!/[a-zA-Z]/.test(t)) return true;
  const lower = t.toLowerCase().replace(/\s+/g, ' ').replace(/\./g, '');
  if (JUNK_TITLES.has(lower)) return true;
  if (/^(s\s*no|page\s*no|table\s*of|list\s*of)/i.test(t)) return true;
  if (/^\d+\s*[-–]\s*\d+$/.test(t)) return true;
  if (/^\d{1,4}$/.test(t)) return true;
  return false;
}

/** Lines that are clearly table headers or PDF chrome, not chapter rows. */
function skipWholeLine(line) {
  const u = line.toLowerCase().trim();
  if (u.length < 2) return true;
  if (/^index\.?$/.test(u)) return true;
  if (/^table\s+of\s+contents\.?$/.test(u)) return true;
  if (/s\.?\s*no\.?\s+name\s+page/i.test(line)) return true;
  if (/s\.?\s*no\.?\s+chapter\s+page/i.test(line)) return true;
  if (/^s\.?\s*no\.?$/.test(u)) return true;
  if (/^page\s*no\.?$/.test(u)) return true;
  if (/^remark\.?$/.test(u)) return true;
  if (/^name\.?$/.test(u) && u.length < 6) return true;
  if (/^\d{1,4}$/.test(line.trim())) return true;
  return false;
}

/**
 * Parse OCR lines into { level: 1|2, title } (level 1 = chapter, 2 = subsection).
 * @param {string} text
 * @returns {Array<{ level: number, title: string }>}
 */
function parseTocTextToEntries(text) {
  const rawLines = String(text).split(/\r?\n/);
  const lines = rawLines
    .map((l) => stripTrailingPageNumbers(l.trim()))
    .filter(Boolean);

  const entries = [];
  const seen = new Set();

  function pushEntry(level, title) {
    const t = (title || '').trim().replace(/\s+/g, ' ');
    if (isGarbageTitle(t)) return;
    const key = `${level}|${t.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ level, title: t });
  }

  for (let line of lines) {
    if (skipWholeLine(line)) continue;

    // INDEX table row: serial | NAME | page (use greedy title so "… & objectives 1" stays in the title)
    let m = line.match(
      /^\s*(\d{1,2})\s+(.+)\s+(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)\s*$/u
    );
    if (m && m[2]) {
      let title = m[2].trim();
      title = stripTrailingPageNumbers(title);
      title = title.replace(/^\d+\s*[-–]\s*\d+\s*$/, '').trim();
      if (!isGarbageTitle(title)) {
        pushEntry(1, title);
      }
      continue;
    }

    // Subsection: 1.1 Title
    m = line.match(/^\s*(\d+)\.(\d+)\s*[.)]?\s*(.+)$/);
    if (m && m[3] && m[3].trim().length >= 2) {
      pushEntry(2, m[3].trim());
      continue;
    }

    if (/^\d+\.\d+/.test(line.trim())) continue;

    // "1 Introduction" (thesis) — serial + title only (page already stripped)
    m = line.match(/^\s*(\d{1,2})\s+(.+)$/);
    if (m && m[2]) {
      let title = m[2].trim();
      if (/^\d+\./.test(title)) continue;
      title = stripTrailingPageNumbers(title);
      if (!isGarbageTitle(title)) {
        pushEntry(1, title);
      }
      continue;
    }

    m = line.match(/^\s*chapter\s+\d+\s*[.:]\s*(.+)$/i);
    if (m && m[1]) {
      pushEntry(1, m[1].trim());
      continue;
    }

    m = line.match(/^\s*[IVXLC]{2,}\s*[.)]\s*(.+)$/i);
    if (m && m[1] && m[1].trim().length >= 3) {
      pushEntry(1, m[1].trim());
    }
  }

  return entries;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Editable placeholder when OpenAI is not used. */
function buildConclusionPlaceholderHtml(projectName) {
  const safe = escapeHtml(projectName || 'this project');
  return (
    `<p>This section concludes the report on <strong>${safe}</strong>. Summarize the main outcomes, limitations of the work, and possible future improvements. Replace this placeholder with your final conclusion.</p>`
  );
}

/**
 * @param {Buffer} imageBuffer
 * @returns {Promise<{ text: string, entries: Array<{ level: number, title: string }> }>}
 */
async function extractTocFromImageBuffer(imageBuffer) {
  const text = await ocrImageToText(imageBuffer);
  const entries = parseTocTextToEntries(text);
  return { text, entries };
}

module.exports = {
  ocrImageToText,
  parseTocTextToEntries,
  extractTocFromImageBuffer,
  buildConclusionPlaceholderHtml
};
