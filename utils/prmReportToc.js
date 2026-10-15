'use strict';

/**
 * Standard report Table of Contents — headings/subheadings that must have body content.
 * Matching aligns with public/js/prm-bulk-import.js and prm-report-outline.js.
 */

const FUZZY_MATCH_MIN = 90;

const SUBHEADING_EQUIVALENCE_GROUPS = [
  [
    'major functional modules',
    'module wise implementation',
    'module-wise implementation',
    'modules wise implementation',
    'functional modules',
    'system modules',
  ],
  ['all screenshots', 'screenshots', 'results and discussion screenshots'],
];

function stripHeadingNumber(heading) {
  return String(heading || '')
    .trim()
    .replace(/^(chapter\s+)?\d+(\.\d+)*\s*[\.\):-]?\s*/i, '')
    .trim();
}

function normalizeMainHeading(raw) {
  let t = String(raw || '').trim();
  t = t.replace(/^chapter\s+\d+\s*[:\u2014\-–]\s*/i, '');
  t = t.replace(/^chapter\s+\d+\s*:\s*/i, '');
  t = t.replace(/^chapter\s+\d+\s*$/i, '');
  t = stripHeadingNumber(t);
  return t.trim();
}

function normalizeMatchKey(title) {
  return normalizeMainHeading(title)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularMatchKey(key) {
  if (!key || key.length < 4) return key;
  if (key === 'references') return 'reference';
  if (key.endsWith('s') && !key.endsWith('ss') && key.length > 5) return key.slice(0, -1);
  return key;
}

const OVERVIEW_SUFFIX_RE = /^( overview| summary| introduction)$/i;

function titleMatchScoreBase(pasteKey, existingKey) {
  if (!pasteKey || !existingKey) return 0;
  if (pasteKey === existingKey) return 100;
  if (singularMatchKey(pasteKey) === singularMatchKey(existingKey)) return 98;

  if (existingKey.indexOf(pasteKey) === 0) {
    const tail = existingKey.slice(pasteKey.length);
    if (OVERVIEW_SUFFIX_RE.test(tail)) return 97;
    const after = existingKey.charAt(pasteKey.length);
    if (!after || after === ' ') {
      if (pasteKey.length >= 4 || pasteKey.split(' ').filter(Boolean).length >= 2) return 95;
    }
  }
  if (pasteKey.indexOf(existingKey) === 0) {
    const after2 = pasteKey.charAt(existingKey.length);
    if (!after2 || after2 === ' ') {
      if (existingKey.length >= 4 || existingKey.split(' ').filter(Boolean).length >= 2) return 93;
    }
  }

  const short = pasteKey.length <= existingKey.length ? pasteKey : existingKey;
  const long = pasteKey.length <= existingKey.length ? existingKey : pasteKey;
  const sw = short.split(' ').filter(Boolean);
  const lw = long.split(' ').filter(Boolean);
  if (sw.length >= 2 && lw.length >= sw.length) {
    let prefixOk = true;
    for (let wi = 0; wi < sw.length; wi++) {
      if (sw[wi] !== lw[wi]) {
        prefixOk = false;
        break;
      }
    }
    if (prefixOk) return 90;
  }
  return 0;
}

function keyInAliasGroup(key, groupKeys) {
  if (groupKeys.indexOf(key) >= 0) return true;
  for (let i = 0; i < groupKeys.length; i++) {
    if (titleMatchScoreBase(key, groupKeys[i]) >= 90) return true;
  }
  return false;
}

function keysShareAliasGroup(k1, k2) {
  for (let gi = 0; gi < SUBHEADING_EQUIVALENCE_GROUPS.length; gi++) {
    const groupKeys = SUBHEADING_EQUIVALENCE_GROUPS[gi].map(normalizeMatchKey);
    if (keyInAliasGroup(k1, groupKeys) && keyInAliasGroup(k2, groupKeys)) return true;
  }
  return false;
}

function titleMatchScore(pasteKey, existingKey) {
  let score = titleMatchScoreBase(pasteKey, existingKey);
  if (keysShareAliasGroup(pasteKey, existingKey)) score = Math.max(score, 96);
  return score;
}

/** @type {Array<{ chapter?: string, heading: string, subs: string[] }>} */
const PRM_CANONICAL_TOC = [
  { chapter: '—', heading: 'Abstract', subs: [] },
  {
    chapter: '01',
    heading: 'Introduction',
    subs: [
      'Background of the Project',
      'Problem Statement',
      'Objectives of the System',
      'Scope of the Project',
      'Existing System Overview',
      'Proposed System Overview',
      'Technologies Used',
      'Overview',
      'Limitations',
      'Advantages',
      'Disadvantages',
    ],
  },
  {
    chapter: '02',
    heading: 'Literature Review / System Study',
    subs: ['Introduction', 'Review of Similar Systems', 'Comparative Analysis', 'Software Development Models'],
  },
  {
    chapter: '03',
    heading: 'System Analysis',
    subs: [
      'Introduction',
      'Functional Requirements',
      'Non-Functional Requirements',
      'User Requirements',
      'Feasibility Study',
      'Technical Feasibility',
      'Economic Feasibility',
      'Operational Feasibility',
      // DFD levels 0–2 are diagram uploads — not text TOC audit.
    ],
  },
  {
    chapter: '04',
    heading: 'System Design',
    // Diagrams / schema visuals (4.2–4.8) are uploaded separately — not text TOC audit.
    subs: ['Introduction'],
  },
  {
    chapter: '05',
    heading: 'System Implementation',
    subs: [
      'Introduction',
      'Development Environment',
      'Tools and Technologies Used',
      'Hardware Requirements',
      'Software Requirements',
      'Module-wise Implementation',
    ],
  },
  {
    chapter: '06',
    heading: 'Testing',
    subs: [
      'Introduction',
      'Testing Strategy',
      'Unit Testing',
      'Integration Testing',
      'System Testing',
      'Test Cases',
      'Bug Reports',
    ],
  },
  // Chapter 7 (screenshots) — product screenshots / SCM, not report body text.
  {
    chapter: '08',
    heading: 'Conclusion and Future Enhancements',
    subs: ['Conclusion', 'Future Enhancements'],
  },
  { chapter: '09', heading: 'References', subs: [] },
];

function flattenTocChecklist() {
  const items = [];
  PRM_CANONICAL_TOC.forEach((ch) => {
    const chapterLabel =
      ch.chapter && ch.chapter !== '—'
        ? `Chapter ${parseInt(ch.chapter, 10)} — ${ch.heading}`
        : ch.heading;
    if (!ch.subs || ch.subs.length === 0) {
      items.push({
        id: `${ch.heading}::__section__`,
        chapter: ch.chapter,
        sectionHeading: ch.heading,
        subheading: null,
        label: chapterLabel,
        kind: 'section',
      });
      return;
    }
    ch.subs.forEach((sub) => {
      items.push({
        id: `${ch.heading}::${sub}`,
        chapter: ch.chapter,
        sectionHeading: ch.heading,
        subheading: sub,
        label: `${chapterLabel} → ${sub}`,
        kind: 'subheading',
      });
    });
  });
  return items;
}

const PRM_TOC_CHECKLIST = flattenTocChecklist();
const PRM_TOC_TOTAL = PRM_TOC_CHECKLIST.length;

function htmlToPlain(html) {
  return String(html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MIN_PLAIN_TEXT_LEN = 25;

function bodyHasContent(body) {
  const raw = String(body || '');
  if (/<img\s/i.test(raw)) return true;
  return htmlToPlain(raw).length >= MIN_PLAIN_TEXT_LEN;
}

function findSection(sections, headingTitle) {
  const key = normalizeMatchKey(headingTitle);
  if (!key) return null;
  let best = null;
  let bestScore = 0;
  (sections || []).forEach((sec) => {
    const hk = normalizeMatchKey(sec.heading);
    if (!hk) return;
    const score = titleMatchScore(key, hk);
    if (score >= FUZZY_MATCH_MIN && score > bestScore) {
      bestScore = score;
      best = sec;
    }
  });
  return best;
}

function findSubheadingBody(section, subTitle) {
  const key = normalizeMatchKey(subTitle);
  if (!key || !section) return { matched: false, body: '' };
  let best = null;
  let bestScore = 0;
  (section.subheadings || []).forEach((sh) => {
    const sk = normalizeMatchKey(sh.subheading);
    if (!sk) return;
    const score = titleMatchScore(key, sk);
    if (score >= FUZZY_MATCH_MIN && score > bestScore) {
      bestScore = score;
      best = sh;
    }
  });
  if (!best) return { matched: false, body: '' };
  return { matched: true, body: best.body || '' };
}

function sectionAnyContent(section) {
  if (!section) return false;
  return (section.subheadings || []).some((sh) => bodyHasContent(sh.body));
}

function isScreenshotsItem(item) {
  const k = normalizeMatchKey(item.subheading || '');
  return k === 'all screenshots' || keysShareAliasGroup(k, 'all screenshots');
}

/**
 * @param {Array<{ heading: string, subheadings: Array<{ subheading: string, body: string }> }>} sections
 * @param {{ screenshotCount?: number }} options
 */
function auditReportToc(sections, options = {}) {
  const screenshotCount = Number(options.screenshotCount) || 0;
  const complete = [];
  const missing = [];

  PRM_TOC_CHECKLIST.forEach((item) => {
    const sec = findSection(sections, item.sectionHeading);
    if (!item.subheading) {
      if (!sec) {
        missing.push({ ...item, reason: 'missing_section', detail: 'Main heading not found' });
        return;
      }
      if (!sectionAnyContent(sec)) {
        missing.push({ ...item, reason: 'no_content', detail: 'Section exists but body is empty' });
        return;
      }
      complete.push(item);
      return;
    }

    if (!sec) {
      missing.push({ ...item, reason: 'missing_section', detail: 'Chapter / section heading not found' });
      return;
    }

    const { matched, body } = findSubheadingBody(sec, item.subheading);
    if (!matched) {
      missing.push({ ...item, reason: 'missing_subheading', detail: 'Subheading not found' });
      return;
    }

    if (isScreenshotsItem(item) && screenshotCount > 0) {
      complete.push(item);
      return;
    }

    if (!bodyHasContent(body)) {
      missing.push({ ...item, reason: 'no_content', detail: 'Subheading exists but content is empty or too short' });
      return;
    }
    complete.push(item);
  });

  const total = PRM_TOC_TOTAL;
  const completeCount = complete.length;
  const pct = total ? Math.min(100, Math.round((completeCount / total) * 100)) : 0;

  return {
    total,
    completeCount,
    missingCount: missing.length,
    pct,
    isTocComplete: missing.length === 0,
    complete,
    missing,
  };
}

module.exports = {
  PRM_CANONICAL_TOC,
  PRM_TOC_CHECKLIST,
  PRM_TOC_TOTAL,
  FUZZY_MATCH_MIN,
  normalizeMatchKey,
  titleMatchScore,
  auditReportToc,
  bodyHasContent,
  htmlToPlain,
};
