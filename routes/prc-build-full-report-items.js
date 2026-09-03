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
    items.push({
      type: 'diagram',
      url: d.url || '',
      label: d.label || '',
      diagram_type: d.diagram_type || ''
    });
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

/**
 * Canonical synopsis structure (UI + user download + sales download):
 * Abstract → TOC (auto in Word) → Introduction → Problem Statement → Existing System →
 * Proposed System → Objectives → System Architecture (diagram only) →
 * Major Functional Modules → Hardware Requirements → Software Requirements →
 * Future Enhancement → Conclusion → References
 */
const SYNOPSIS_SLOTS = [
  {
    id: 'abstract',
    title: 'Abstract',
    match: /^(abstract|executive\s*summary)$/i,
    diagramOnly: false
  },
  {
    id: 'introduction',
    title: 'Introduction',
    // Prefer Overview; plain "Introduction" only under Intro chapter (not Literature/Analysis/…)
    match: /^introduction\b/i,
    preferMatch: /^(general\s+)?overview$/i,
    rejectParent: /literature|system\s*study|system\s*analysis|system\s*design|implementation|testing|conclusion/i,
    diagramOnly: false
  },
  {
    id: 'problem',
    title: 'Problem Statement',
    match: /^problem\s*statement\b/i,
    diagramOnly: false
  },
  {
    id: 'existing',
    title: 'Existing System',
    match: /^existing\s*system\b/i,
    diagramOnly: false
  },
  {
    id: 'proposed',
    title: 'Proposed System',
    match: /^proposed\s*system\b/i,
    diagramOnly: false
  },
  {
    id: 'objectives',
    title: 'Objectives',
    match: /^objectives?\b/i,
    diagramOnly: false
  },
  {
    id: 'architecture',
    title: 'System Architecture',
    match: /^(system\s*)?architecture\b|system\s*architecture/i,
    diagramOnly: true
  },
  {
    id: 'modules',
    title: 'Major Functional Modules',
    match:
      /major\s*functional\s*modules|module[- ]?wise(\s+implementation)?|functional\s*modules/i,
    diagramOnly: false
  },
  {
    id: 'hardware',
    title: 'Hardware Requirements',
    match: /^hardware\s*requirements?\b|^hardware\s*(and|&|\/)\s*software/i,
    diagramOnly: false
  },
  {
    id: 'software',
    title: 'Software Requirements',
    match: /^software\s*requirements?\b/i,
    diagramOnly: false
  },
  {
    id: 'future',
    title: 'Future Enhancement',
    match: /^future\s*(enhancement|enhancements|scope|work)\b/i,
    diagramOnly: false
  },
  {
    id: 'conclusion',
    title: 'Conclusion',
    match: /^conclusions?\b/i,
    diagramOnly: false
  },
  {
    id: 'references',
    title: 'References',
    match: /^references?\b/i,
    diagramOnly: false
  }
];

function stripHeadingNumber(heading) {
  return (heading || '')
    .toString()
    .trim()
    .replace(/^(chapter\s+)?\d+(\.\d+)*\s*[\.\):-]?\s*/i, '')
    .trim();
}

function matchSynopsisSlot(heading, parentHeading) {
  const h = stripHeadingNumber(heading);
  if (!h) return null;
  for (const slot of SYNOPSIS_SLOTS) {
    if (!slot.match.test(h)) continue;
    if (slot.rejectParent && parentHeading) {
      const p = stripHeadingNumber(parentHeading);
      if (slot.rejectParent.test(p)) continue;
    }
    return slot;
  }
  return null;
}

function findSynopsisOverviewContent(sections) {
  for (const sec of sections) {
    for (const child of sec.children || []) {
      if (child.type !== 'subheading') continue;
      const bare = stripHeadingNumber(child.subheading);
      if (/^(general\s+)?overview$/i.test(bare) && (child.body || '').toString().trim()) {
        return child;
      }
    }
  }
  // Fallback: first contentful subheading under a top-level Introduction chapter (skip Background)
  for (const sec of sections) {
    const parent = stripHeadingNumber(sec.heading && sec.heading.heading);
    if (!/^introduction\b/i.test(parent)) continue;
    if (/literature|system\s*study|analysis|design|implementation|testing/i.test(parent)) continue;
    for (const child of sec.children || []) {
      if (child.type !== 'subheading') continue;
      const bare = stripHeadingNumber(child.subheading);
      if (/background(\s+of\s+(the\s+)?project)?/i.test(bare)) continue;
      if ((child.body || '').toString().trim()) return child;
    }
  }
  return null;
}

function pickArchitectureDiagram(diagrams) {
  const list = Array.isArray(diagrams) ? diagrams : [];
  const byType = list.find((d) => {
    const t = (d.diagram_type || d.label || '').toString().toLowerCase();
    return /system_architecture|architecture/.test(t);
  });
  if (byType) {
    return { type: 'diagram', url: byType.url || '', label: byType.label || 'System Architecture' };
  }
  const first = list.find((d) => d && (d.url || d.type === 'diagram'));
  if (!first) return null;
  if (first.type === 'diagram') return first;
  return { type: 'diagram', url: first.url || '', label: first.label || 'System Architecture' };
}

function collectBodiesFromChildren(children) {
  const parts = [];
  for (const child of children || []) {
    if (!child) continue;
    if (child.type === 'diagram') continue;
    // Synopsis: content only from subheading/body text — never emit nested subheading titles
    if ((child.type === 'subheading' || child.type === 'body') && (child.body || '').toString().trim()) {
      parts.push(String(child.body).trim());
    }
  }
  return parts;
}

/**
 * Trim + reorder full report items to the fixed synopsis structure.
 * Content comes from subheading bodies only (no 1.1 / nested subheading titles in Word).
 * System Architecture = heading + 1 diagram only.
 */
function filterSynopsisItems(items) {
  const list = Array.isArray(items) ? items : [];
  const sections = [];
  let current = null;
  const orphanDiagrams = [];

  for (const item of list) {
    if (!item || !item.type) continue;
    if (item.type === 'heading') {
      current = { heading: item, children: [] };
      sections.push(current);
      continue;
    }
    if (item.type === 'diagram') {
      orphanDiagrams.push(item);
      continue;
    }
    if (item.type === 'screenshot' || item.type === 'db_screenshot' || item.type === 'db_datatable') {
      continue;
    }
    if (current && (item.type === 'subheading' || item.type === 'body')) {
      current.children.push(item);
    }
  }

  const bySlot = Object.create(null);

  // Introduction: prefer "Overview" (not Background of the Project / Literature Review → Introduction)
  const overviewChild = findSynopsisOverviewContent(sections);
  if (overviewChild) {
    bySlot.introduction = {
      heading: { type: 'heading', heading: 'Introduction' },
      children: [overviewChild]
    };
  }

  // 1) Prefer subheading title matches (synopsis content lives in subheadings)
  for (const sec of sections) {
    const parentTitle = sec.heading && sec.heading.heading;
    for (const child of sec.children) {
      if (child.type !== 'subheading') continue;
      const slot = matchSynopsisSlot(child.subheading, parentTitle);
      if (!slot || slot.diagramOnly || bySlot[slot.id]) continue;
      // Skip plain Introduction matches when we already have Overview content
      if (slot.id === 'introduction' && bySlot.introduction) continue;
      bySlot[slot.id] = {
        heading: { type: 'heading', heading: slot.title },
        children: [child]
      };
    }
  }

  // 2) Fallback: parent heading match — only subheads not already claimed by another slot
  for (const sec of sections) {
    const parentTitle = sec.heading && sec.heading.heading;
    const slot = matchSynopsisSlot(parentTitle, null);
    if (!slot || slot.diagramOnly || bySlot[slot.id]) continue;
    if (slot.id === 'introduction' && slot.rejectParent && slot.rejectParent.test(stripHeadingNumber(parentTitle))) {
      continue;
    }
    const children = [];
    for (const child of sec.children) {
      if (child.type !== 'subheading' && child.type !== 'body') continue;
      if (child.type === 'subheading') {
        const other = matchSynopsisSlot(child.subheading, parentTitle);
        if (other && other.id !== slot.id) continue;
      }
      children.push(child);
    }
    bySlot[slot.id] = {
      heading: { type: 'heading', heading: slot.title },
      children
    };
  }

  // Mark architecture if heading/subheading exists (diagram attached below)
  for (const sec of sections) {
    if (bySlot.architecture) break;
    const slot = matchSynopsisSlot(sec.heading && sec.heading.heading, null);
    if (slot && slot.id === 'architecture') {
      bySlot.architecture = { heading: { type: 'heading', heading: slot.title }, children: [] };
      break;
    }
    for (const child of sec.children) {
      if (
        child.type === 'subheading' &&
        matchSynopsisSlot(child.subheading, sec.heading && sec.heading.heading)?.id === 'architecture'
      ) {
        bySlot.architecture = { heading: { type: 'heading', heading: 'System Architecture' }, children: [] };
        break;
      }
    }
  }

  // Combined "Hardware and Software Requirements"
  if (bySlot.hardware && !bySlot.software) {
    const h = stripHeadingNumber(
      (bySlot.hardware.heading && bySlot.hardware.heading.heading) || ''
    );
    const fromCombinedHeading = /hardware\s*(and|&|\/)\s*software/i.test(h);
    const hwChildren = [];
    const swChildren = [];
    for (const child of bySlot.hardware.children) {
      const sh = (child.subheading || '').toString();
      if (/software/i.test(sh) && !/hardware/i.test(sh)) swChildren.push(child);
      else if (/hardware/i.test(sh)) hwChildren.push(child);
      else hwChildren.push(child);
    }
    if (fromCombinedHeading || swChildren.length) {
      bySlot.hardware = {
        heading: { type: 'heading', heading: 'Hardware Requirements' },
        children: hwChildren.length ? hwChildren : bySlot.hardware.children
      };
      if (swChildren.length) {
        bySlot.software = {
          heading: { type: 'heading', heading: 'Software Requirements' },
          children: swChildren
        };
      }
    }
  }

  // "System Requirements" with HW/SW subheads
  for (const sec of sections) {
    const bare = stripHeadingNumber(sec.heading && sec.heading.heading);
    if (!/^system\s*requirements?\b/i.test(bare)) continue;
    if (!bySlot.hardware) {
      const hw = sec.children.filter(
        (c) => c.type === 'subheading' && /hardware/i.test(c.subheading || '')
      );
      if (hw.length) {
        bySlot.hardware = {
          heading: { type: 'heading', heading: 'Hardware Requirements' },
          children: hw
        };
      }
    }
    if (!bySlot.software) {
      const sw = sec.children.filter(
        (c) => c.type === 'subheading' && /software/i.test(c.subheading || '')
      );
      if (sw.length) {
        bySlot.software = {
          heading: { type: 'heading', heading: 'Software Requirements' },
          children: sw
        };
      }
    }
  }

  const diagram = pickArchitectureDiagram(orphanDiagrams);

  const out = [];
  for (const slot of SYNOPSIS_SLOTS) {
    const sec = bySlot[slot.id];
    if (slot.id === 'architecture') {
      if (!sec && !diagram) continue;
      out.push({ type: 'heading', heading: slot.title });
      if (diagram) out.push(diagram);
      continue;
    }
    if (!sec) continue;
    const bodies = collectBodiesFromChildren(sec.children);
    if (!bodies.length && slot.id !== 'abstract') {
      // Keep empty slot heading only when we had a section match with no body yet — skip empties
      continue;
    }
    out.push({ type: 'heading', heading: slot.title });
    for (const body of bodies) {
      out.push({ type: 'body', body });
    }
  }
  return out;
}

/**
 * Pre Defined Project Report — fixed chapter/subheading structure (UI + downloads).
 * Same export pipeline as synopsis (Word/PDF); different TOC only.
 */
const PREDEFINED_CHAPTERS = [
  {
    title: 'Abstract',
    mode: 'abstract',
    sections: []
  },
  {
    title: 'Introduction',
    sections: [
      { title: 'Background of the Project', mode: 'content', match: /background(\s+of\s+(the\s+)?project)?/i },
      { title: 'Problem Statement', mode: 'content', match: /problem\s*statement/i },
      { title: 'Objectives of the System', mode: 'content', match: /objectives?(\s+of\s+(the\s+)?system)?/i },
      { title: 'Scope of the Project', mode: 'content', match: /scope(\s+of\s+(the\s+)?project)?/i },
      { title: 'Existing System Overview', mode: 'content', match: /existing\s*system/i },
      { title: 'Proposed System Overview', mode: 'content', match: /proposed\s*system/i },
      { title: 'Technologies Used', mode: 'content', match: /technologies?\s*used|tech\s*stack/i },
      { title: 'Overview', mode: 'content', match: /^(general\s+)?overview$/i },
      { title: 'Limitations', mode: 'content', match: /limitations?/i },
      { title: 'Advantages', mode: 'content', match: /^advantages?$/i },
      { title: 'Disadvantages', mode: 'content', match: /disadvantages?/i }
    ]
  },
  {
    title: 'Literature Review / System Study',
    sections: [
      { title: 'Introduction', mode: 'content', match: /^introduction$/i, preferChapter: /literature|system\s*study/i },
      { title: 'Review of Similar Systems', mode: 'content', match: /similar\s*systems?|literature\s*review|review\s+of/i },
      { title: 'Comparative Analysis', mode: 'content', match: /comparative\s*analysis/i },
      { title: 'Software Development Models', mode: 'content', match: /software\s*development\s*models?|sdlc/i }
    ]
  },
  {
    title: 'System Analysis',
    sections: [
      { title: 'Introduction', mode: 'content', match: /^introduction$/i, preferChapter: /system\s*analysis/i },
      { title: 'Functional Requirements', mode: 'content', match: /functional\s*requirements?/i },
      { title: 'Non-Functional Requirements', mode: 'content', match: /non[-\s]*functional\s*requirements?/i },
      { title: 'User Requirements', mode: 'content', match: /user\s*requirements?/i },
      { title: 'Feasibility Study', mode: 'content', match: /^feasibility\s*study$/i },
      { title: 'Technical Feasibility', mode: 'content', match: /technical\s*feasibility/i },
      { title: 'Economic Feasibility', mode: 'content', match: /economic\s*feasibility/i },
      { title: 'Operational Feasibility', mode: 'content', match: /operational\s*feasibility/i },
      { title: 'System Architecture', mode: 'diagram', diagramTypes: ['system_architecture_diagram'] },
      { title: 'Data Flow Diagram (Level 0)', mode: 'diagram', diagramTypes: ['dfd_zero_level'] },
      { title: 'Data Flow Diagram (Level 1)', mode: 'diagram', diagramTypes: ['dfd_first_level'] },
      { title: 'Data Flow Diagram (Level 2)', mode: 'diagram', diagramTypes: ['dfd_second_level'] }
    ]
  },
  {
    title: 'System Design',
    sections: [
      { title: 'Introduction', mode: 'content', match: /^introduction$/i, preferChapter: /system\s*design|design/i },
      { title: 'Use Case Diagram', mode: 'diagram', diagramTypes: ['use_case_diagram'] },
      { title: 'Class Diagram', mode: 'diagram', diagramTypes: ['class_diagram'] },
      { title: 'Sequence Diagram', mode: 'diagram', diagramTypes: ['sequence_diagram'] },
      { title: 'Activity Diagram', mode: 'diagram', diagramTypes: ['activity_diagram'] },
      { title: 'ER Diagram', mode: 'diagram', diagramTypes: ['er_diagram'] },
      { title: 'Database Schema', mode: 'db_screenshots' },
      { title: 'Table Structures', mode: 'db_datatables' }
    ]
  },
  {
    title: 'System Implementation',
    sections: [
      { title: 'Introduction', mode: 'content', match: /^introduction$/i, preferChapter: /implementation/i },
      { title: 'Development Environment', mode: 'content', match: /development\s*environment/i },
      { title: 'Tools and Technologies Used', mode: 'content', match: /tools?\s*(and|&)\s*technologies?|technologies?\s*used/i },
      { title: 'Hardware Requirements', mode: 'content', match: /hardware\s*requirements?/i },
      { title: 'Software Requirements', mode: 'content', match: /software\s*requirements?/i },
      {
        title: 'Module-wise Implementation',
        mode: 'content',
        match: /module[- ]?wise|functional\s*modules|major\s*functional/i
      }
    ]
  },
  {
    title: 'Testing',
    sections: [
      { title: 'Introduction', mode: 'content', match: /^introduction$/i, preferChapter: /testing/i },
      { title: 'Testing Strategy', mode: 'content', match: /testing\s*strategy/i },
      { title: 'Unit Testing', mode: 'content', match: /unit\s*testing/i },
      { title: 'Integration Testing', mode: 'content', match: /integration\s*testing/i },
      { title: 'System Testing', mode: 'content', match: /system\s*testing/i },
      { title: 'Test Cases', mode: 'content', match: /test\s*cases?/i },
      { title: 'Bug Reports', mode: 'content', match: /bug\s*reports?/i }
    ]
  },
  {
    title: 'Results and Discussion',
    mode: 'screenshots_only',
    sections: []
  },
  {
    title: 'Conclusion and Future Enhancements',
    sections: [
      { title: 'Conclusion', mode: 'content', match: /^conclusion$/i },
      { title: 'Future Enhancements', mode: 'content', match: /future\s*(enhancement|enhancements|scope)/i }
    ]
  },
  {
    title: 'References',
    mode: 'references',
    sections: []
  }
];

function pickDiagramByTypes(diagrams, types) {
  const list = Array.isArray(diagrams) ? diagrams : [];
  const wanted = (types || []).map((t) => String(t).toLowerCase());
  if (!wanted.length) return null;
  const found = list.find((d) => {
    const t = (d.diagram_type || '').toString().toLowerCase();
    return wanted.includes(t);
  });
  if (!found) {
    // fallback: label contains key words
    const foundByLabel = list.find((d) => {
      const label = (d.label || '').toString().toLowerCase();
      return wanted.some((w) => label.includes(w.replace(/_/g, ' ').replace(/ diagram$/, '')));
    });
    if (!foundByLabel) return null;
    return {
      type: 'diagram',
      url: foundByLabel.url || '',
      label: foundByLabel.label || '',
      diagram_type: foundByLabel.diagram_type || ''
    };
  }
  return {
    type: 'diagram',
    url: found.url || '',
    label: found.label || '',
    diagram_type: found.diagram_type || ''
  };
}

function findContentBodies(sections, slot) {
  const prefer = slot.preferChapter || null;
  const scored = [];

  const consider = (title, children, parentTitle, scoreBoost) => {
    const bare = stripHeadingNumber(title);
    if (!slot.match.test(bare)) return;
    // Chapter "Introduction" slots must stay under their preferred chapter
    if (prefer && /^introduction$/i.test(slot.title)) {
      const parentBare = stripHeadingNumber(parentTitle || '');
      const selfOk = prefer.test(bare);
      const parentOk = prefer.test(parentBare);
      if (!selfOk && !parentOk) return;
    }
    let score = scoreBoost;
    if (prefer && parentTitle && prefer.test(stripHeadingNumber(parentTitle))) score += 10;
    if (prefer && prefer.test(bare)) score += 5;
    const collected = collectBodiesFromChildren(children).filter((b) => (b || '').toString().trim());
    if (!collected.length) return;
    scored.push({ score, bodies: collected });
  };

  for (const sec of sections) {
    const parent = (sec.heading && sec.heading.heading) || '';
    for (const child of sec.children) {
      if (child.type === 'subheading') consider(child.subheading, [child], parent, 3);
    }
    consider(parent, sec.children, parent, 1);
  }

  if (!scored.length) return [];
  scored.sort((a, b) => b.score - a.score);
  return scored[0].bodies;
}

function findReferencesBodies(sections) {
  for (const sec of sections) {
    if (isReferencesSection(sec.heading && sec.heading.heading)) {
      return collectBodiesFromChildren(sec.children);
    }
    for (const child of sec.children) {
      if (child.type === 'subheading' && isReferencesSection(child.subheading)) {
        return collectBodiesFromChildren([child]);
      }
    }
  }
  return [];
}

/**
 * Reorder / shape full library items into the Pre Defined report TOC.
 * Diagram slots = title + diagram only; Ch7 = screenshots; 4.4 db shots; 4.5 datatables.
 */
function filterPredefinedReportItems(items) {
  const list = Array.isArray(items) ? items : [];
  const sections = [];
  let current = null;
  const diagrams = [];
  const screenshots = [];
  const dbScreenshots = [];
  const dbDatatables = [];

  for (const item of list) {
    if (!item || !item.type) continue;
    if (item.type === 'heading') {
      current = { heading: item, children: [] };
      sections.push(current);
      continue;
    }
    if (item.type === 'diagram') {
      diagrams.push(item);
      continue;
    }
    if (item.type === 'screenshot') {
      screenshots.push(item);
      continue;
    }
    if (item.type === 'db_screenshot') {
      dbScreenshots.push(item);
      continue;
    }
    if (item.type === 'db_datatable') {
      dbDatatables.push(item);
      continue;
    }
    if (current && (item.type === 'subheading' || item.type === 'body')) {
      current.children.push(item);
    }
  }

  const out = [];
  const usedDiagramUrls = new Set();

  for (const chapter of PREDEFINED_CHAPTERS) {
    if (chapter.mode === 'abstract') {
      const absSlot = { title: 'Abstract', match: /^(abstract|executive\s*summary)$/i };
      let bodies = findContentBodies(sections, absSlot);
      if (!bodies.length) {
        // Also accept section titled Abstract with any children
        for (const sec of sections) {
          if (/^(abstract|executive\s*summary)$/i.test(stripHeadingNumber(sec.heading && sec.heading.heading))) {
            bodies = collectBodiesFromChildren(sec.children).filter((b) => (b || '').toString().trim());
            break;
          }
        }
      }
      out.push({ type: 'heading', heading: 'Abstract' });
      bodies.forEach((body) => out.push({ type: 'body', body }));
      continue;
    }

    if (chapter.mode === 'screenshots_only') {
      if (!screenshots.length) continue;
      out.push({ type: 'heading', heading: chapter.title });
      screenshots.forEach((s) => out.push(s));
      continue;
    }

    if (chapter.mode === 'references') {
      const bodies = findReferencesBodies(sections);
      out.push({ type: 'heading', heading: chapter.title });
      bodies.forEach((body) => out.push({ type: 'body', body }));
      continue;
    }

    const chapterItems = [];
    for (const slot of chapter.sections || []) {
      if (slot.mode === 'diagram') {
        const types = slot.diagramTypes || [];
        if (!types.length) {
          // Container label (e.g. UML Diagrams) — only if a following typed diagram exists
          continue;
        }
        const diag = pickDiagramByTypes(
          diagrams.filter((d) => !usedDiagramUrls.has(d.url || '')),
          types
        );
        if (!diag) continue;
        usedDiagramUrls.add(diag.url || '');
        chapterItems.push({ type: 'subheading', subheading: slot.title, body: '' });
        chapterItems.push(diag);
        continue;
      }

      if (slot.mode === 'db_screenshots') {
        if (!dbScreenshots.length) continue;
        chapterItems.push({ type: 'subheading', subheading: slot.title, body: '' });
        dbScreenshots.forEach((s) => chapterItems.push(s));
        continue;
      }

      if (slot.mode === 'db_datatables') {
        if (!dbDatatables.length) continue;
        chapterItems.push({ type: 'subheading', subheading: slot.title, body: '' });
        dbDatatables.forEach((t) => chapterItems.push(t));
        continue;
      }

      // content
      const bodies = findContentBodies(sections, slot);
      if (!bodies.length) continue;
      // First body on subheading; extra bodies as plain body blocks
      chapterItems.push({ type: 'subheading', subheading: slot.title, body: bodies[0] || '' });
      for (let i = 1; i < bodies.length; i++) {
        chapterItems.push({ type: 'body', body: bodies[i] });
      }
    }

    if (!chapterItems.length) continue;
    out.push({ type: 'heading', heading: chapter.title });
    out.push(...chapterItems);
  }

  return out;
}

module.exports = {
  buildFullReportItems,
  filterSynopsisItems,
  filterPredefinedReportItems,
  SYNOPSIS_SLOTS,
  PREDEFINED_CHAPTERS
};
