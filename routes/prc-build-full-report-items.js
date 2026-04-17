/**
 * Build Project Report Creator `items` payload as if every content-library option were selected.
 * Keeps the same ordering as views/project-report-creator/builder.ejs getSelectedItems().
 */

const DIAGRAM_LIBRARY_ORDER = [
  'system_architecture_diagram',
  'dfd_zero_level',
  'dfd_first_level',
  'dfd_second_level',
  'er_diagram',
  'use_case_diagram',
  'class_diagram',
  'activity_diagram',
  'sequence_diagram',
  'flow_chart_diagram'
];

function diagramLibrarySortRank(diagramType) {
  const t = (diagramType || '').toString().trim().toLowerCase();
  const i = DIAGRAM_LIBRARY_ORDER.indexOf(t);
  return i === -1 ? DIAGRAM_LIBRARY_ORDER.length : i;
}

function getDiagramRenderOrder(diagramsList) {
  return diagramsList
    .map((d, idx) => ({
      idx,
      rank: diagramLibrarySortRank(d.diagram_type),
      type: (d.diagram_type || '').toString()
    }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.idx - b.idx;
    })
    .map((x) => x.idx);
}

function isReferencesSection(heading) {
  const h = (heading || '').toString().trim().toLowerCase();
  return h === 'references' || h === 'reference';
}

/**
 * @param {object} data
 * @param {Array<{heading?: string, subheadings?: Array<{subheading?: string, body?: string}>}>} data.sections
 * @param {Array<{url?: string, name?: string, data_table?: string}>} data.dbScreenshots
 * @param {Array<{url?: string, type?: string, name?: string}>} data.screenshots
 * @param {Array<{diagram_type?: string, url?: string, label?: string}>} data.diagrams
 */
function buildFullReportItems(data) {
  const sectionsData = data.sections || [];
  const dbScreenshotsData = data.dbScreenshots || [];
  const screenshotsData = data.screenshots || [];
  const diagramsData = data.diagrams || [];

  const items = [];
  const refsSection = [];
  const otherSections = [];

  sectionsData.forEach((sec) => {
    const heading = sec.heading || '(Untitled)';
    const sectionItems = [];
    sectionItems.push({ type: 'heading', heading });
    (sec.subheadings || []).forEach((sh) => {
      sectionItems.push({
        type: 'subheading',
        subheading: sh.subheading || '(Untitled)',
        body: sh.body || ''
      });
    });
    if (isReferencesSection(heading)) refsSection.push(...sectionItems);
    else otherSections.push(...sectionItems);
  });
  items.push(...otherSections);

  getDiagramRenderOrder(diagramsData).forEach((idx) => {
    const d = diagramsData[idx];
    if (!d) return;
    items.push({ type: 'diagram', url: d.url || '', label: d.label || '' });
  });

  dbScreenshotsData.forEach((db) => {
    if (db.data_table) {
      items.push({
        type: 'db_datatable',
        name: db.name || 'Database Screenshot',
        data_table: db.data_table || ''
      });
    }
  });

  dbScreenshotsData.forEach((db) => {
    items.push({
      type: 'db_screenshot',
      url: db.url || '',
      name: db.name || 'Database Screenshot'
    });
  });

  const orderedScreenshots = screenshotsData.map((s) => ({
    url: s.url || '',
    type: (s.type || '').toLowerCase(),
    name: s.name || 'Screenshot'
  }));
  orderedScreenshots.sort((a, b) => {
    const order = { input_design: 0, output_design: 1 };
    const oa = order[a.type] ?? 2;
    const ob = order[b.type] ?? 2;
    return oa - ob;
  });
  orderedScreenshots.forEach((s) => {
    items.push({ type: 'screenshot', url: s.url, name: s.name });
  });

  items.push(...refsSection);
  return items;
}

module.exports = { buildFullReportItems };
