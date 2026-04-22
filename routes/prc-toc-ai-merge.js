/**
 * Merge AI-extracted TOC entries with full library report items; insert missing headings/subheadings.
 */

function isReferencesSection(heading) {
  const h = (heading || '').toString().trim().toLowerCase();
  return h === 'references' || h === 'reference';
}

function normalizeTitle(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/^(chapter\s*\d+\s*[:.)]\s*)/i, '')
    .replace(/^\d+(\.\d+)?\s*[.)]?\s*/i, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isConclusionTitle(s) {
  const n = normalizeTitle(s);
  return n === 'conclusion' || n === 'conclusions' || n.startsWith('conclusion ');
}

function insertBeforeReferences(items, toInsert) {
  if (!toInsert || !toInsert.length) return items || [];
  const refIdx = (items || []).findIndex(
    (it) => it.type === 'heading' && isReferencesSection(it.heading)
  );
  if (refIdx === -1) return (items || []).concat(toInsert);
  return items.slice(0, refIdx).concat(toInsert).concat(items.slice(refIdx));
}

/**
 * @param {Array} fullItems - from buildFullReportItems
 * @param {Array<{ level: number, title: string }>} tocEntries
 * @param {Array<{ heading?: string, subheadings?: Array<{ subheading?: string }> }>} sectionsData
 * @returns {{ mergedItems: Array, addedCount: number, addedLabels: string[] }}
 */
function mergeTocWithFullLibraryItems(fullItems, tocEntries, sectionsData) {
  const sections = sectionsData || [];

  function hasMainInLibrary(title) {
    const n = normalizeTitle(title);
    return sections.some((s) => normalizeTitle(s.heading || '') === n);
  }

  function hasSubInLibrary(mainTitle, subTitle) {
    const nm = normalizeTitle(mainTitle);
    const ns = normalizeTitle(subTitle);
    const sec = sections.find((s) => normalizeTitle(s.heading || '') === nm);
    if (!sec) return false;
    return (sec.subheadings || []).some((sh) => normalizeTitle(sh.subheading || '') === ns);
  }

  const extra = [];
  const addedLabels = [];
  const seenHeading = new Set();
  const seenSub = new Set();

  let lastMain = '';
  for (const e of tocEntries || []) {
    const level = Number(e.level) === 2 ? 2 : 1;
    const title = (e.title || '').toString().trim();
    if (!title) continue;

    if (level === 1) {
      lastMain = title;
      const n = normalizeTitle(title);
      if (seenHeading.has(n)) continue;
      if (hasMainInLibrary(title)) continue;
      seenHeading.add(n);
      extra.push({ type: 'heading', heading: title });
      addedLabels.push(`Chapter: ${title}`);
    } else {
      const main = lastMain || '';
      const key = `${normalizeTitle(main)}||${normalizeTitle(title)}`;
      if (seenSub.has(key)) continue;
      if (main && hasSubInLibrary(main, title)) {
        seenSub.add(key);
        continue;
      }
      seenSub.add(key);
      extra.push({ type: 'subheading', subheading: title, body: '' });
      addedLabels.push(`Sub: ${title}${main ? ` (under ${main})` : ''}`);
    }
  }

  const mergedItems = insertBeforeReferences([...(fullItems || [])], extra);
  return {
    mergedItems,
    addedCount: extra.length,
    addedLabels
  };
}

module.exports = {
  normalizeTitle,
  isReferencesSection,
  isConclusionTitle,
  mergeTocWithFullLibraryItems,
  insertBeforeReferences
};
