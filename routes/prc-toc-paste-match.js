/**
 * Build reportItems from a pasted TOC: match library content by exact/related
 * titles; diagram/DB/screenshot special slots; blank placeholders for missing.
 */

const { normalizeTitle } = require('./prc-toc-ai-merge');
const { parseTocTextToEntries } = require('./prc-toc-ocr');

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'and',
  'or',
  'to',
  'in',
  'for',
  'on',
  'with',
  'by',
  'at',
  'as',
  'is',
  'are',
  'level',
  'diagram',
  'diagrams',
  'chapter',
  'section',
  'its',
  'into'
]);

/** DFD levels emitted when TOC says plain "Data Flow Diagram". */
const DFD_ALL_LEVELS = [
  { types: ['dfd_zero_level'], label: 'Zero Level DFD' },
  { types: ['dfd_first_level'], label: 'First Level DFD' },
  { types: ['dfd_second_level'], label: 'Second Level DFD' }
];

/** Special TOC slots: media only (no prose). Specific DFD levels before generic DFD. */
const SPECIAL_SLOTS = [
  {
    id: 'architecture',
    mode: 'diagram',
    diagramTypes: ['system_architecture_diagram'],
    match: /system\s*architecture|architecture\s*(diagram|design)?|sys\.?\s*architecture/i
  },
  {
    id: 'dfd0',
    mode: 'diagram',
    diagramTypes: ['dfd_zero_level'],
    match: /data\s*flow\s*diagram\s*\(?\s*level\s*0\s*\)?|dfd\s*\(?\s*level\s*0\s*\)?|dfd\s*0|context\s*diagram|zero\s*level\s*dfd/i
  },
  {
    id: 'dfd1',
    mode: 'diagram',
    diagramTypes: ['dfd_first_level'],
    match: /data\s*flow\s*diagram\s*\(?\s*level\s*1\s*\)?|dfd\s*\(?\s*level\s*1\s*\)?|dfd\s*1|first\s*level\s*dfd/i
  },
  {
    id: 'dfd2',
    mode: 'diagram',
    diagramTypes: ['dfd_second_level'],
    match: /data\s*flow\s*diagram\s*\(?\s*level\s*2\s*\)?|dfd\s*\(?\s*level\s*2\s*\)?|dfd\s*2|second\s*level\s*dfd/i
  },
  {
    // Plain "Data Flow Diagram" / "DFD" → all three levels (0 same page, 1 & 2 next pages)
    id: 'dfd_all',
    mode: 'dfd_all',
    match: /data\s*flow\s*diagrams?|^dfds?$/i
  },
  {
    id: 'uml_parent',
    mode: 'uml_parent',
    match: /^uml\s*diagrams?$/i
  },
  {
    id: 'use_case',
    mode: 'diagram',
    diagramTypes: ['use_case_diagram'],
    match: /use\s*case\s*diagram|use\s*case/i
  },
  {
    id: 'class',
    mode: 'diagram',
    diagramTypes: ['class_diagram'],
    match: /class\s*diagram/i
  },
  {
    id: 'sequence',
    mode: 'diagram',
    diagramTypes: ['sequence_diagram'],
    match: /sequence\s*diagram/i
  },
  {
    id: 'activity',
    mode: 'diagram',
    diagramTypes: ['activity_diagram'],
    match: /activity\s*diagram/i
  },
  {
    id: 'er',
    mode: 'diagram',
    diagramTypes: ['er_diagram'],
    match: /\ber\s*diagram\b|entity[\s\-]*relationship(\s*diagram)?|e[\s\-]*r\s*diagram/i
  },
  {
    id: 'db_schema',
    mode: 'db_screenshots',
    match: /database\s*schema|db\s*schema|schema\s*design|database\s*design|data\s*dictionary/i
  },
  {
    id: 'table_structures',
    mode: 'db_datatables',
    match: /table\s*structures?|data\s*tables?|database\s*tables?/i
  },
  {
    id: 'results',
    mode: 'screenshots_only',
    match: /results?\s*(and|&)?\s*discussion|output\s*(screens?|design)|screenshots?\s*(and|&)?\s*results?|discussion\s*(and|&)?\s*results?/i
  },
  {
    id: 'references',
    mode: 'references',
    match: /^(references?|bibliography|bibliographies|works?\s*cited)$/i
  }
];

/** Map related TOC titles onto library titles (Bibliography → References). */
function canonicalTitleKey(s) {
  const n = normalizeTitle(s);
  if (!n) return '';
  if (
    n === 'bibliography' ||
    n === 'bibliographies' ||
    n === 'works cited' ||
    n === 'work cited' ||
    n === 'reference' ||
    n === 'references'
  ) {
    return 'references';
  }
  if (n === 'data dictionary') {
    return 'database schema';
  }
  if (n === 'entity relationship diagram' || n === 'entity relationship' || n === 'er diagram') {
    return 'er diagram';
  }
  return n;
}

function isReferencesTitle(s) {
  return canonicalTitleKey(s) === 'references';
}

const UML_DIAGRAM_TYPES = [
  'use_case_diagram',
  'class_diagram',
  'sequence_diagram',
  'activity_diagram'
];

function tokensOf(s) {
  return normalizeTitle(s)
    .split(/\s+/)
    .filter((t) => t && t.length > 1 && !STOPWORDS.has(t));
}

function scoreTitles(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  const ca = canonicalTitleKey(a);
  const cb = canonicalTitleKey(b);
  if (ca && cb && ca === cb) return 100;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length);
    const longer = Math.max(na.length, nb.length);
    return 70 + Math.round((shorter / longer) * 20);
  }
  const ta = tokensOf(a);
  const tb = new Set(tokensOf(b));
  if (!ta.length || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) {
    if (tb.has(t)) shared++;
  }
  if (!shared) return 0;
  const ratio = shared / Math.max(ta.length, tb.size);
  if (ratio < 0.4 && shared < 2) return 0;
  return Math.round(40 + ratio * 40);
}

function detectSpecialSlot(title) {
  const t = String(title || '').trim();
  if (!t) return null;
  // Prefer more specific DFD / named diagrams before generic "UML"
  for (const slot of SPECIAL_SLOTS) {
    if (slot.match.test(t)) return slot;
  }
  return null;
}

function pickDiagramByTypes(diagrams, types, usedUrls) {
  const list = Array.isArray(diagrams) ? diagrams : [];
  const wanted = (types || []).map((x) => String(x).toLowerCase());
  const available = list.filter((d) => d && d.url && !usedUrls.has(d.url));

  const byType = available.find((d) => wanted.includes(String(d.diagram_type || '').toLowerCase()));
  if (byType) {
    return {
      type: 'diagram',
      url: byType.url || '',
      label: byType.label || '',
      diagram_type: byType.diagram_type || ''
    };
  }

  const byLabel = available.find((d) => {
    const label = (d.label || '').toString().toLowerCase();
    return wanted.some((w) => {
      const key = w.replace(/_/g, ' ').replace(/\s*diagram$/, '').trim();
      return key && label.includes(key);
    });
  });
  if (!byLabel) return null;
  return {
    type: 'diagram',
    url: byLabel.url || '',
    label: byLabel.label || '',
    diagram_type: byLabel.diagram_type || ''
  };
}

function collectBodiesFromSubheadings(subs) {
  const out = [];
  (subs || []).forEach((sh) => {
    const body = (sh && sh.body) || '';
    if (String(body).replace(/<[^>]+>/g, ' ').trim()) out.push(body);
  });
  return out;
}

/** Collect References/Bibliography bodies from library (no nested title spam). */
function findReferencesBodies(sections) {
  for (const sec of sections || []) {
    if (isReferencesTitle(sec.heading || '')) {
      return collectBodiesFromSubheadings(sec.subheadings);
    }
    for (const sh of sec.subheadings || []) {
      if (isReferencesTitle(sh.subheading || '')) {
        const b = (sh.body || '').toString();
        if (String(b).replace(/<[^>]+>/g, ' ').trim()) return [b];
      }
    }
  }
  return [];
}

function pushReferenceBodies(reportItems, bodies) {
  let n = 0;
  (bodies || []).forEach((body) => {
    if (!String(body || '').replace(/<[^>]+>/g, ' ').trim()) return;
    reportItems.push({ type: 'body', body });
    n++;
  });
  return n;
}

/**
 * Find best content match in library sections.
 * @param {string} title
 * @param {Array} sections
 * @param {string} [parentTitle]
 * @param {{ preferSection?: boolean, excludeSubKeys?: Set<string> }} [opts]
 * @returns {{ kind: 'section'|'sub', section, sub?, score, key?: string }|null}
 */
function findBestContentMatch(title, sections, parentTitle, opts) {
  const preferSection = !!(opts && opts.preferSection);
  const excludeSubKeys = (opts && opts.excludeSubKeys) || null;
  let bestSection = null;
  let bestSub = null;
  const preferParent = parentTitle ? normalizeTitle(parentTitle) : '';

  for (const sec of sections || []) {
    const heading = sec.heading || '';
    let score = scoreTitles(title, heading);
    if (preferParent && score > 0) {
      const parentScore = scoreTitles(parentTitle, heading);
      if (parentScore >= 50) score += 8;
    }
    if (score >= 50 && (!bestSection || score > bestSection.score)) {
      bestSection = { kind: 'section', section: sec, score };
    }

    for (const sh of sec.subheadings || []) {
      const subKey = subContentKey(sec, sh);
      if (excludeSubKeys && excludeSubKeys.has(subKey)) continue;
      let subScore = scoreTitles(title, sh.subheading || '');
      if (preferParent) {
        const parentOnSec = scoreTitles(parentTitle, heading);
        if (parentOnSec >= 50) subScore += 12;
        else if (parentOnSec >= 40) subScore += 5;
      }
      if (/^introduction$/i.test(normalizeTitle(title)) && preferParent) {
        const parentOnSec = scoreTitles(parentTitle, heading);
        if (parentOnSec < 40) subScore = Math.min(subScore, 45);
      }
      if (subScore >= 50 && (!bestSub || subScore > bestSub.score)) {
        bestSub = { kind: 'sub', section: sec, sub: sh, score: subScore, key: subKey };
      }
    }
  }

  // Chapter titles (level 1): prefer matching a whole section, not a child subtitle
  if (preferSection) {
    if (bestSection) return bestSection;
    return bestSub;
  }
  if (bestSub && bestSection) {
    return bestSub.score > bestSection.score ? bestSub : bestSection;
  }
  return bestSub || bestSection;
}

function subContentKey(sec, sh) {
  if (sh && sh.id != null) return `id:${sh.id}`;
  const secH = normalizeTitle((sec && sec.heading) || '');
  const subH = normalizeTitle((sh && sh.subheading) || '');
  const body = String((sh && sh.body) || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return `t:${secH}|${subH}|${body}`;
}

function tocHasChildAfter(tocEntries, idx) {
  const next = tocEntries[idx + 1];
  return !!(next && Number(next.level) === 2);
}

function mapDbScreenshots(rows) {
  return (rows || []).map((db) => ({
    type: 'db_screenshot',
    url: db.url || '',
    name: db.name || 'Database Screenshot'
  }));
}

function mapDbDatatables(rows) {
  const out = [];
  (rows || []).forEach((db) => {
    if (!db.data_table) return;
    out.push({
      type: 'db_datatable',
      name: db.name || 'Datatable',
      data_table: db.data_table || ''
    });
  });
  return out;
}

function mapScreenshots(rows) {
  const ordered = (rows || []).map((s) => ({
    type: 'screenshot',
    url: s.url || '',
    name: s.name || 'Screenshot',
    _scrType: (s.type || '').toLowerCase()
  }));
  ordered.sort((a, b) => {
    const order = { input_design: 0, output_design: 1 };
    const oa = order[a._scrType] ?? 2;
    const ob = order[b._scrType] ?? 2;
    return oa - ob;
  });
  return ordered.map(({ _scrType, ...rest }) => rest);
}

/**
 * Parse pasted TOC: numbered lines via OCR heuristics, plus plain title lines.
 * @param {string} text
 * @returns {Array<{ level: number, title: string }>}
 */
function parsePastedTocToEntries(text) {
  const strict = parseTocTextToEntries(text || '');
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) =>
      String(l)
        .replace(/\s+\d{1,3}\s*[-–—]\s*\d{1,3}\s*$/u, '')
        .replace(/\s+\d{1,4}\s*$/u, '')
        .trim()
    )
    .filter(Boolean);

  const entries = [];
  const seen = new Set();
  function push(level, title) {
    const t = String(title || '')
      .trim()
      .replace(/\s+/g, ' ');
    if (t.length < 2 || !/[a-zA-Z]/.test(t)) return;
    if (/^(table\s+of\s+contents|contents|index)$/i.test(t)) return;
    const key = `${level}|${normalizeTitle(t)}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ level, title: t });
  }

  for (const line of lines) {
    let m = line.match(/^\s*(\d+)\.(\d+)\s*[.)]?\s*(.+)$/);
    if (m && m[3]) {
      push(2, m[3]);
      continue;
    }
    m = line.match(/^\s*chapter\s+\d+\s*[.:]\s*(.+)$/i);
    if (m && m[1]) {
      push(1, m[1]);
      continue;
    }
    m = line.match(/^\s*(\d{1,2})\s+[.)]?\s*(.+)$/);
    if (m && m[2] && !/^\d+\./.test(m[2].trim())) {
      push(1, m[2]);
      continue;
    }
    // Plain title line (no leading number)
    if (!/^\d/.test(line) && !/^s\.?\s*no/i.test(line)) {
      push(1, line);
    }
  }

  // Prefer richer parse: if flexible found more, use it; else strict
  if (entries.length >= strict.length) return entries;
  return strict.length ? strict : entries;
}

/**
 * @param {object} opts
 * @param {Array<{level:number,title:string}>} opts.tocEntries
 * @param {Array} opts.sections - sectionsWithSub from loadPrcLibraryForExport
 * @param {Array} opts.diagrams
 * @param {Array} opts.screenshots
 * @param {Array} opts.dbScreenshots - rows may include data_table
 * @returns {{ reportItems: Array, matchedLabels: string[], missingLabels: string[], notes: string[] }}
 */
function buildReportItemsFromPastedToc(opts) {
  const tocEntries = opts.tocEntries || [];
  const sections = opts.sections || [];
  const diagrams = opts.diagrams || [];
  const screenshots = opts.screenshots || [];
  const dbScreenshots = opts.dbScreenshots || [];

  const reportItems = [];
  const matchedLabels = [];
  const missingLabels = [];
  const notes = [];
  const usedDiagramUrls = new Set();
  let screenshotsAttached = false;
  let dbShotsAttached = false;
  let dbTablesAttached = false;

  let lastMainTitle = '';
  /** Library subtitle keys already used under the current chapter (prevents 4.1 / 4.2 same title). */
  let usedSubKeysUnderChapter = new Set();
  /** Normalized subheading titles already emitted under current chapter. */
  let usedSubTitlesUnderChapter = new Set();

  function pushBlank(level, title) {
    if (level === 1) {
      reportItems.push({ type: 'heading', heading: title, blankPage: true });
      usedSubKeysUnderChapter = new Set();
      usedSubTitlesUnderChapter = new Set();
    } else {
      const nt = normalizeTitle(title);
      if (nt && usedSubTitlesUnderChapter.has(nt)) {
        // Skip duplicate blank subtitle with the same name
        return;
      }
      if (nt) usedSubTitlesUnderChapter.add(nt);
      reportItems.push({ type: 'subheading', subheading: title, body: '', blankPage: true });
    }
    missingLabels.push(title);
  }

  function pushHeading(level, title) {
    if (level === 1) {
      reportItems.push({ type: 'heading', heading: title });
      usedSubKeysUnderChapter = new Set();
      usedSubTitlesUnderChapter = new Set();
    } else {
      reportItems.push({ type: 'subheading', subheading: title, body: '' });
    }
  }

  function pushUniqueSubheading(subheading, body, opts) {
    const title = (subheading || '').toString().trim() || 'Section';
    const nt = normalizeTitle(title);
    const key = opts && opts.key;
    if (key && usedSubKeysUnderChapter.has(key)) return false;
    if (nt && usedSubTitlesUnderChapter.has(nt)) return false;
    if (key) usedSubKeysUnderChapter.add(key);
    if (nt) usedSubTitlesUnderChapter.add(nt);
    const hasBody = String(body || '')
      .replace(/<[^>]+>/g, ' ')
      .trim().length > 0;
    reportItems.push({
      type: 'subheading',
      subheading: title,
      body: hasBody ? body : '',
      blankPage: !hasBody
    });
    return true;
  }

  for (const entry of tocEntries) {
    const level = Number(entry.level) === 2 ? 2 : 1;
    const title = (entry.title || '').toString().trim();
    if (!title) continue;

    if (level === 1) lastMainTitle = title;
    const parentTitle = level === 2 ? lastMainTitle : '';
    const entryIdx = tocEntries.indexOf(entry);
    const nextIsChild = tocHasChildAfter(tocEntries, entryIdx);

    const special = detectSpecialSlot(title);

    if (special && special.mode === 'uml_parent') {
      pushHeading(level, title);
      const umlDiags = UML_DIAGRAM_TYPES.map((t) => pickDiagramByTypes(diagrams, [t], usedDiagramUrls)).filter(
        Boolean
      );
      if (umlDiags.length) {
        umlDiags.forEach((d) => {
          usedDiagramUrls.add(d.url || '');
          reportItems.push(d);
        });
        matchedLabels.push(`${title} (UML diagrams)`);
      } else {
        reportItems[reportItems.length - 1].blankPage = true;
        missingLabels.push(`${title} (no UML diagrams)`);
      }
      continue;
    }

    // Plain "Data Flow Diagram": Zero Level same page, First/Second on following pages
    if (special && special.mode === 'dfd_all') {
      pushHeading(level, title);
      let attached = 0;
      DFD_ALL_LEVELS.forEach((lvl, i) => {
        const diag = pickDiagramByTypes(diagrams, lvl.types, usedDiagramUrls);
        if (i === 0 && level === 2) {
          // Title already emitted as subtitle — put Zero Level diagram on the same page
          if (diag) {
            usedDiagramUrls.add(diag.url || '');
            reportItems.push({
              type: 'diagram',
              url: diag.url || '',
              label: lvl.label,
              diagram_type: diag.diagram_type || lvl.types[0]
            });
            attached++;
            matchedLabels.push(`${title} → ${lvl.label}`);
          } else {
            reportItems[reportItems.length - 1].blankPage = true;
            missingLabels.push(`${lvl.label} (diagram missing)`);
          }
          return;
        }
        reportItems.push({
          type: 'subheading',
          subheading: lvl.label,
          body: '',
          blankPage: !diag
        });
        if (diag) {
          usedDiagramUrls.add(diag.url || '');
          reportItems.push({
            type: 'diagram',
            url: diag.url || '',
            label: lvl.label,
            diagram_type: diag.diagram_type || lvl.types[0]
          });
          attached++;
        } else {
          missingLabels.push(`${lvl.label} (diagram missing)`);
        }
      });
      if (attached) matchedLabels.push(`${title} → ${attached} DFD level(s)`);
      else if (!missingLabels.some((m) => m.includes('DFD'))) missingLabels.push(`${title} (no DFD diagrams)`);
      continue;
    }

    if (special && special.mode === 'diagram') {
      pushHeading(level, title);
      const diag = pickDiagramByTypes(diagrams, special.diagramTypes, usedDiagramUrls);
      if (diag) {
        usedDiagramUrls.add(diag.url || '');
        reportItems.push(diag);
        matchedLabels.push(`${title} → diagram`);
      } else {
        reportItems[reportItems.length - 1].blankPage = true;
        missingLabels.push(`${title} (diagram missing)`);
      }
      continue;
    }

    if (special && special.mode === 'db_screenshots') {
      pushHeading(level, title);
      const shots = mapDbScreenshots(dbScreenshots);
      if (shots.length) {
        shots.forEach((s) => reportItems.push(s));
        dbShotsAttached = true;
        matchedLabels.push(`${title} → DB screenshots`);
      } else {
        reportItems[reportItems.length - 1].blankPage = true;
        missingLabels.push(`${title} (no DB screenshots)`);
      }
      continue;
    }

    if (special && special.mode === 'db_datatables') {
      pushHeading(level, title);
      const tables = mapDbDatatables(dbScreenshots);
      if (tables.length) {
        tables.forEach((t) => reportItems.push(t));
        dbTablesAttached = true;
        matchedLabels.push(`${title} → data tables`);
      } else {
        reportItems[reportItems.length - 1].blankPage = true;
        missingLabels.push(`${title} (no data tables)`);
      }
      continue;
    }

    if (special && special.mode === 'screenshots_only') {
      pushHeading(level, title);
      const shots = mapScreenshots(screenshots);
      if (shots.length) {
        shots.forEach((s) => reportItems.push(s));
        screenshotsAttached = true;
        matchedLabels.push(`${title} → screenshots`);
      } else {
        reportItems[reportItems.length - 1].blankPage = true;
        missingLabels.push(`${title} (no screenshots)`);
      }
      continue;
    }

    // References / Bibliography — chapter heading + direct content only (never 11.1 References)
    if (special && special.mode === 'references') {
      if (level === 2 && isReferencesTitle(lastMainTitle)) {
        // Nested "References" under Bibliography/References chapter — skip duplicate title
        continue;
      }
      if (level === 1) {
        reportItems.push({ type: 'heading', heading: title });
        usedSubKeysUnderChapter = new Set();
        usedSubTitlesUnderChapter = new Set();
      } else {
        // Lone level-2 References line without parent chapter — promote to heading
        reportItems.push({ type: 'heading', heading: title });
        usedSubKeysUnderChapter = new Set();
        usedSubTitlesUnderChapter = new Set();
      }
      const bodies = findReferencesBodies(sections);
      const n = pushReferenceBodies(reportItems, bodies);
      if (n) matchedLabels.push(`${title} → references content (no subheading)`);
      else {
        reportItems[reportItems.length - 1].blankPage = true;
        missingLabels.push(`${title} (empty references)`);
      }
      continue;
    }

    // Normal content match
    // Skip nested References/Bibliography subtitle under a References chapter
    if (level === 2 && isReferencesTitle(title) && isReferencesTitle(lastMainTitle)) {
      continue;
    }

    const hit = findBestContentMatch(title, sections, parentTitle, {
      preferSection: level === 1,
      excludeSubKeys: level === 2 ? usedSubKeysUnderChapter : null
    });
    if (!hit) {
      pushBlank(level, title);
      continue;
    }

    // Any References match → heading + direct body blocks (never numbered subheading)
    if (
      isReferencesTitle(title) ||
      (hit.kind === 'section' && isReferencesTitle(hit.section.heading || '')) ||
      (hit.kind === 'sub' && isReferencesTitle((hit.sub && hit.sub.subheading) || ''))
    ) {
      if (level === 1 || !isReferencesTitle(lastMainTitle)) {
        reportItems.push({ type: 'heading', heading: isReferencesTitle(title) ? title : 'References' });
        usedSubKeysUnderChapter = new Set();
        usedSubTitlesUnderChapter = new Set();
      }
      let bodies = [];
      if (hit.kind === 'section') bodies = collectBodiesFromSubheadings(hit.section.subheadings);
      else if (hit.sub && hit.sub.body) bodies = [hit.sub.body];
      if (!bodies.length) bodies = findReferencesBodies(sections);
      const n = pushReferenceBodies(reportItems, bodies);
      if (n) matchedLabels.push(`${title} → references content (no subheading)`);
      else if (level === 1) {
        reportItems[reportItems.length - 1].blankPage = true;
        missingLabels.push(`${title} (empty references)`);
      }
      continue;
    }

    if (hit.kind === 'sub') {
      const body = (hit.sub && hit.sub.body) || '';
      const hasBody = String(body).replace(/<[^>]+>/g, ' ').trim().length > 0;
      const subKey = hit.key || subContentKey(hit.section, hit.sub);
      if (level === 1) {
        // Chapter matched a library subtitle — emit chapter only; attach body only if TOC has no children
        reportItems.push({ type: 'heading', heading: title });
        usedSubKeysUnderChapter = new Set();
        usedSubTitlesUnderChapter = new Set();
        if (nextIsChild) {
          matchedLabels.push(`${title} (chapter)`);
        } else if (hasBody) {
          if (pushUniqueSubheading(hit.sub.subheading || title, body, { key: subKey })) {
            matchedLabels.push(`${title} ← ${hit.sub.subheading || title}`);
          }
        } else {
          reportItems[reportItems.length - 1].blankPage = true;
          missingLabels.push(`${title} (empty content)`);
        }
      } else if (
        usedSubKeysUnderChapter.has(subKey) ||
        usedSubTitlesUnderChapter.has(normalizeTitle(title))
      ) {
        // Same library block / same title already under this chapter — skip duplicate
        continue;
      } else if (pushUniqueSubheading(title, hasBody ? body : '', { key: subKey })) {
        if (hasBody) matchedLabels.push(`${title} ← ${hit.sub.subheading || title}`);
        else missingLabels.push(`${title} (empty content)`);
      }
      continue;
    }

    // Matched a whole section
    const bodies = collectBodiesFromSubheadings(hit.section.subheadings);
    if (level === 1) {
      reportItems.push({ type: 'heading', heading: title });
      usedSubKeysUnderChapter = new Set();
      usedSubTitlesUnderChapter = new Set();
      // If TOC lists subsections next, only emit the chapter heading here
      if (!nextIsChild) {
        if (bodies.length) {
          (hit.section.subheadings || []).forEach((sh) => {
            const b = (sh.body || '').toString();
            if (!String(b).replace(/<[^>]+>/g, ' ').trim()) return;
            pushUniqueSubheading(sh.subheading || title, b, { key: subContentKey(hit.section, sh) });
          });
          matchedLabels.push(`${title} ← ${hit.section.heading || title}`);
        } else {
          reportItems[reportItems.length - 1].blankPage = true;
          missingLabels.push(`${title} (empty section)`);
        }
      } else {
        matchedLabels.push(`${title} (chapter)`);
      }
    } else if (bodies.length) {
      const firstSh = (hit.section.subheadings || []).find((sh) =>
        String(sh.body || '')
          .replace(/<[^>]+>/g, ' ')
          .trim()
      );
      const key = firstSh
        ? subContentKey(hit.section, firstSh)
        : `sec:${normalizeTitle(hit.section.heading || title)}`;
      if (usedSubKeysUnderChapter.has(key) || usedSubTitlesUnderChapter.has(normalizeTitle(title))) {
        continue;
      }
      if (pushUniqueSubheading(title, bodies[0], { key })) {
        for (let i = 1; i < bodies.length; i++) {
          reportItems.push({ type: 'body', body: bodies[i] });
        }
        matchedLabels.push(`${title} ← ${hit.section.heading || title}`);
      }
    } else {
      pushBlank(2, title);
    }
  }

  if (matchedLabels.length) {
    notes.push(`Matched ${matchedLabels.length} TOC line(s) to library content or media.`);
  }
  if (missingLabels.length) {
    notes.push(
      `${missingLabels.length} TOC line(s) had no match or empty content — blank page placeholders added.`
    );
  }
  if (screenshotsAttached) notes.push('Attached project screenshots under Results-related TOC entries.');
  if (dbShotsAttached) notes.push('Attached database screenshots under Database Schema.');
  if (dbTablesAttached) notes.push('Attached data tables under Table Structures.');

  return { reportItems, matchedLabels, missingLabels, notes };
}

module.exports = {
  buildReportItemsFromPastedToc,
  parsePastedTocToEntries,
  detectSpecialSlot,
  scoreTitles,
  SPECIAL_SLOTS
};
