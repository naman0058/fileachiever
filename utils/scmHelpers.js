/**
 * Source Code Manager — shared list enrichment, filters, stats & chart data.
 */
const TOTAL_DIAGRAMS = 10;

/** Demo URL present; screenshots, diagrams, and DB screenshots all missing. */
function scmDemoOnlyIncompleteSql(alias = 'sc') {
  const a = alias;
  return `(
    ${a}.demo_url IS NOT NULL AND ${a}.demo_url != ''
    AND (${a}.image IS NULL OR ${a}.image = '') AND (SELECT COUNT(*) FROM screenshots WHERE source_code_id = ${a}.id) = 0
    AND (SELECT COUNT(*) FROM source_code_diagrams WHERE source_code_id = ${a}.id) < ${TOTAL_DIAGRAMS}
    AND (SELECT COUNT(*) FROM source_code_database_screenshots WHERE source_code_id = ${a}.id) = 0
  )`;
}

const SCM_LIST_SQL = `
  SELECT sc.id, sc.name, sc.seo_name, sc.category, sc.image, sc.demo_url,
    sc.scm_screenshot_verified, sc.scm_demo_verified,
    (SELECT COUNT(*) FROM screenshots WHERE source_code_id = sc.id) AS screenshot_count,
    (SELECT COUNT(*) FROM source_code_diagrams WHERE source_code_id = sc.id) AS diagram_count,
    (SELECT COUNT(*) FROM source_code_database_screenshots WHERE source_code_id = sc.id) AS db_screenshot_count,
    (SELECT COUNT(*) FROM source_code_database_screenshots WHERE source_code_id = sc.id AND data_table IS NOT NULL AND TRIM(data_table) != '') AS db_with_datatable_count
  FROM source_code sc
`;

function computeSourceCodeScreenshotTotal(row) {
  const tableCount = parseInt(row.screenshot_count || 0, 10);
  const mainImg = (row.image && String(row.image).trim()) || '';
  if (tableCount > 0) return tableCount;
  return mainImg ? 1 : 0;
}

function enrichSourceCodeRow(r) {
  const hasImage = !!(r.image && String(r.image).trim());
  const tableScreenshotCount = parseInt(r.screenshot_count || 0, 10);
  const hasScreenshots = tableScreenshotCount > 0;
  const hasScreenshot = hasImage || hasScreenshots;
  const hasDemo = !!(r.demo_url && String(r.demo_url).trim());
  const totalScreenshotCount = computeSourceCodeScreenshotTotal(r);
  const diagramCount = parseInt(r.diagram_count || 0, 10);
  const hasAllDiagrams = diagramCount >= TOTAL_DIAGRAMS;
  const dbScreenshotCount = parseInt(r.db_screenshot_count || 0, 10);
  const dbWithDatatableCount = parseInt(r.db_with_datatable_count || 0, 10);
  const hasDbScreenshots = dbScreenshotCount > 0;
  const hasAllDatatables = dbScreenshotCount > 0 && dbWithDatatableCount >= dbScreenshotCount;
  const isVerified = !!(r.scm_screenshot_verified && r.scm_demo_verified);
  const isFullyComplete = hasScreenshot && hasDemo && hasAllDiagrams && hasDbScreenshots;

  const checks = [hasScreenshot, hasDemo, hasAllDiagrams, hasDbScreenshots];
  const completionPct = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  const missing = [];
  if (!hasScreenshot) missing.push('screenshot');
  if (!hasDemo) missing.push('demo');
  if (!hasAllDiagrams) missing.push('diagrams');
  if (!hasDbScreenshots) missing.push('db');

  return {
    ...r,
    hasScreenshot,
    hasDemo,
    diagramCount,
    hasAllDiagrams,
    dbScreenshotCount,
    dbWithDatatableCount,
    hasDbScreenshots,
    hasAllDatatables,
    totalScreenshotCount,
    tableScreenshotCount,
    needsScreenshot: !hasScreenshot,
    needsDemo: !hasDemo,
    needsDiagrams: !hasAllDiagrams,
    needsDbScreenshots: !hasDbScreenshots,
    isVerified,
    isFullyComplete,
    completionPct,
    missing,
    missingCount: missing.length
  };
}

function parseScmFilters(query = {}) {
  const tab = (query.tab || 'all').toString();
  const q = (query.q || '').toString().trim();
  const category = (query.category || '').toString().trim();
  const missing = (query.missing || 'all').toString();
  const verified = (query.verified || 'all').toString();
  const sort = (query.sort || 'id_desc').toString();
  return { tab, q, category, missing, verified, sort };
}

function buildScmQueryString(filters, overrides = {}) {
  const f = { ...filters, ...overrides };
  const p = new URLSearchParams();
  if (f.tab && f.tab !== 'all') p.set('tab', f.tab);
  if (f.q) p.set('q', f.q);
  if (f.category) p.set('category', f.category);
  if (f.missing && f.missing !== 'all') p.set('missing', f.missing);
  if (f.verified && f.verified !== 'all') p.set('verified', f.verified);
  if (f.sort && f.sort !== 'id_desc') p.set('sort', f.sort);
  return p.toString();
}

function buildScmWhere(filters) {
  const where = ['1=1'];
  const params = [];

  if (filters.tab === 'pending') {
    where.push(`(
      (sc.image IS NULL OR sc.image = '') AND (SELECT COUNT(*) FROM screenshots WHERE source_code_id = sc.id) = 0
      OR sc.demo_url IS NULL OR sc.demo_url = ''
      OR (SELECT COUNT(*) FROM source_code_diagrams WHERE source_code_id = sc.id) < ${TOTAL_DIAGRAMS}
      OR (SELECT COUNT(*) FROM source_code_database_screenshots WHERE source_code_id = sc.id) = 0
    )`);
  } else if (filters.tab === 'complete') {
    where.push(`(
      (sc.image IS NOT NULL AND sc.image != '' OR (SELECT COUNT(*) FROM screenshots WHERE source_code_id = sc.id) > 0)
      AND sc.demo_url IS NOT NULL AND sc.demo_url != ''
      AND (SELECT COUNT(*) FROM source_code_diagrams WHERE source_code_id = sc.id) >= ${TOTAL_DIAGRAMS}
      AND (SELECT COUNT(*) FROM source_code_database_screenshots WHERE source_code_id = sc.id) > 0
    )`);
  } else if (filters.tab === 'verified') {
    where.push(`sc.scm_screenshot_verified = 1 AND sc.scm_demo_verified = 1`);
  } else if (filters.tab === 'unverified') {
    where.push(`(sc.scm_screenshot_verified IS NULL OR sc.scm_screenshot_verified = 0 OR sc.scm_demo_verified IS NULL OR sc.scm_demo_verified = 0)`);
  }

  if (filters.missing === 'screenshot') {
    where.push(`(sc.image IS NULL OR sc.image = '') AND (SELECT COUNT(*) FROM screenshots WHERE source_code_id = sc.id) = 0`);
  } else if (filters.missing === 'demo') {
    where.push(`(sc.demo_url IS NULL OR sc.demo_url = '')`);
  } else if (filters.missing === 'diagrams') {
    where.push(`(SELECT COUNT(*) FROM source_code_diagrams WHERE source_code_id = sc.id) < ${TOTAL_DIAGRAMS}`);
  } else if (filters.missing === 'db') {
    where.push(`(SELECT COUNT(*) FROM source_code_database_screenshots WHERE source_code_id = sc.id) = 0`);
  } else if (filters.missing === 'only-demo') {
    where.push(scmDemoOnlyIncompleteSql('sc'));
  } else if (filters.missing === 'any') {
    where.push(`(
      (sc.image IS NULL OR sc.image = '') AND (SELECT COUNT(*) FROM screenshots WHERE source_code_id = sc.id) = 0
      OR sc.demo_url IS NULL OR sc.demo_url = ''
      OR (SELECT COUNT(*) FROM source_code_diagrams WHERE source_code_id = sc.id) < ${TOTAL_DIAGRAMS}
      OR (SELECT COUNT(*) FROM source_code_database_screenshots WHERE source_code_id = sc.id) = 0
    )`);
  }

  if (filters.verified === 'verified') {
    where.push(`sc.scm_screenshot_verified = 1 AND sc.scm_demo_verified = 1`);
  } else if (filters.verified === 'unverified') {
    where.push(`(sc.scm_screenshot_verified IS NULL OR sc.scm_screenshot_verified = 0 OR sc.scm_demo_verified IS NULL OR sc.scm_demo_verified = 0)`);
  }

  if (filters.category) {
    where.push(`sc.category = ?`);
    params.push(filters.category);
  }

  if (filters.q) {
    where.push(`(sc.name LIKE ? OR sc.seo_name LIKE ? OR sc.description LIKE ?)`);
    const like = `%${filters.q.replace(/%/g, '\\%')}%`;
    params.push(like, like, like);
  }

  return { where, params };
}

function buildScmOrderBy(sort) {
  switch (sort) {
    case 'name_asc': return 'sc.name ASC';
    case 'gaps_desc': return 'missing_score DESC, sc.id DESC';
    case 'completion_asc': return 'completion_score ASC, sc.id DESC';
    case 'completion_desc': return 'completion_score DESC, sc.id DESC';
    default: return 'sc.id DESC';
  }
}

async function fetchScmStats(queryAsync) {
  const [
    totalRow,
    completeRow,
    verifiedRow,
    missScreenshotRow,
    missDemoRow,
    missDiagramsRow,
    missDbRow,
    onlyDemoRow
  ] = await Promise.all([
    queryAsync(`SELECT COUNT(*) AS c FROM source_code`),
    queryAsync(`SELECT COUNT(*) AS c FROM source_code sc WHERE (
      (sc.image IS NOT NULL AND sc.image != '' OR (SELECT COUNT(*) FROM screenshots WHERE source_code_id = sc.id) > 0)
      AND sc.demo_url IS NOT NULL AND sc.demo_url != ''
      AND (SELECT COUNT(*) FROM source_code_diagrams WHERE source_code_id = sc.id) >= ${TOTAL_DIAGRAMS}
      AND (SELECT COUNT(*) FROM source_code_database_screenshots WHERE source_code_id = sc.id) > 0
    )`),
    queryAsync(`SELECT COUNT(*) AS c FROM source_code WHERE scm_screenshot_verified = 1 AND scm_demo_verified = 1`),
    queryAsync(`SELECT COUNT(*) AS c FROM source_code sc WHERE (sc.image IS NULL OR sc.image = '') AND (SELECT COUNT(*) FROM screenshots WHERE source_code_id = sc.id) = 0`),
    queryAsync(`SELECT COUNT(*) AS c FROM source_code WHERE demo_url IS NULL OR demo_url = ''`),
    queryAsync(`SELECT COUNT(*) AS c FROM source_code sc WHERE (SELECT COUNT(*) FROM source_code_diagrams WHERE source_code_id = sc.id) < ${TOTAL_DIAGRAMS}`),
    queryAsync(`SELECT COUNT(*) AS c FROM source_code sc WHERE (SELECT COUNT(*) FROM source_code_database_screenshots WHERE source_code_id = sc.id) = 0`),
    queryAsync(`SELECT COUNT(*) AS c FROM source_code sc WHERE ${scmDemoOnlyIncompleteSql('sc')}`)
  ]);

  const total = totalRow[0]?.c || 0;
  const complete = completeRow[0]?.c || 0;
  const pending = Math.max(0, total - complete);
  const verified = verifiedRow[0]?.c || 0;

  return {
    total,
    complete,
    pending,
    verified,
    unverified: Math.max(0, total - verified),
    completionRate: total ? Math.round((complete / total) * 100) : 0,
    gaps: {
      screenshot: missScreenshotRow[0]?.c || 0,
      demo: missDemoRow[0]?.c || 0,
      diagrams: missDiagramsRow[0]?.c || 0,
      db: missDbRow[0]?.c || 0,
      onlyDemo: onlyDemoRow[0]?.c || 0
    }
  };
}

function resolveScmActiveNav(filters) {
  if (!filters) return 'overview';
  if (filters.tab === 'pending') return 'gaps';
  if (filters.tab === 'complete') return 'complete';
  if (filters.tab === 'verified') return 'verified';
  if (filters.tab === 'unverified') return 'unverified';
  if (filters.missing === 'screenshot') return 'missing-screenshot';
  if (filters.missing === 'demo') return 'missing-demo';
  if (filters.missing === 'only-demo') return 'only-demo';
  if (filters.missing === 'diagrams') return 'missing-diagrams';
  if (filters.missing === 'db') return 'missing-db';
  return 'overview';
}

async function fetchScmDashboard(queryAsync, filters, options = {}) {
  const { limit = 500 } = options;
  const { where, params } = buildScmWhere(filters);
  const orderBy = buildScmOrderBy(filters.sort);

  const needsScore = filters.sort === 'gaps_desc' || filters.sort === 'completion_asc' || filters.sort === 'completion_desc';
  const scoreSelect = needsScore ? `,
    (
      CASE WHEN (sc.image IS NOT NULL AND sc.image != '' OR (SELECT COUNT(*) FROM screenshots WHERE source_code_id = sc.id) > 0) THEN 1 ELSE 0 END +
      CASE WHEN sc.demo_url IS NOT NULL AND sc.demo_url != '' THEN 1 ELSE 0 END +
      CASE WHEN (SELECT COUNT(*) FROM source_code_diagrams WHERE source_code_id = sc.id) >= ${TOTAL_DIAGRAMS} THEN 1 ELSE 0 END +
      CASE WHEN (SELECT COUNT(*) FROM source_code_database_screenshots WHERE source_code_id = sc.id) > 0 THEN 1 ELSE 0 END
    ) AS completion_score,
    (
      4 - (
        CASE WHEN (sc.image IS NOT NULL AND sc.image != '' OR (SELECT COUNT(*) FROM screenshots WHERE source_code_id = sc.id) > 0) THEN 1 ELSE 0 END +
        CASE WHEN sc.demo_url IS NOT NULL AND sc.demo_url != '' THEN 1 ELSE 0 END +
        CASE WHEN (SELECT COUNT(*) FROM source_code_diagrams WHERE source_code_id = sc.id) >= ${TOTAL_DIAGRAMS} THEN 1 ELSE 0 END +
        CASE WHEN (SELECT COUNT(*) FROM source_code_database_screenshots WHERE source_code_id = sc.id) > 0 THEN 1 ELSE 0 END
      )
    ) AS missing_score` : '';

  const rows = await queryAsync(
    `SELECT sc.id, sc.name, sc.seo_name, sc.category, sc.image, sc.demo_url,
      sc.scm_screenshot_verified, sc.scm_demo_verified,
      (SELECT COUNT(*) FROM screenshots WHERE source_code_id = sc.id) AS screenshot_count,
      (SELECT COUNT(*) FROM source_code_diagrams WHERE source_code_id = sc.id) AS diagram_count,
      (SELECT COUNT(*) FROM source_code_database_screenshots WHERE source_code_id = sc.id) AS db_screenshot_count,
      (SELECT COUNT(*) FROM source_code_database_screenshots WHERE source_code_id = sc.id AND data_table IS NOT NULL AND TRIM(data_table) != '') AS db_with_datatable_count
      ${scoreSelect}
     FROM source_code sc
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT ${Number(limit) || 500}`,
    params
  );

  const enriched = (rows || []).map(enrichSourceCodeRow);

  const [stats, categories] = await Promise.all([
    fetchScmStats(queryAsync),
    queryAsync(`SELECT category, COUNT(*) AS total FROM source_code WHERE category IS NOT NULL AND category != '' GROUP BY category ORDER BY total DESC LIMIT 12`)
  ]);

  const total = stats.total;
  const complete = stats.complete;
  const pending = stats.pending;
  const verified = stats.verified;

  const categoryLabels = (categories || []).map((c) => c.category || 'Other');
  const categoryTotals = (categories || []).map((c) => c.total || 0);

  const chartData = {
    completionLabels: ['Fully Complete', 'Has Gaps'],
    completionValues: [complete, pending],
    gapLabels: ['Screenshots', 'Demo Link', 'Diagrams', 'DB Screenshots'],
    gapValues: [stats.gaps.screenshot, stats.gaps.demo, stats.gaps.diagrams, stats.gaps.db],
    categoryLabels,
    categoryTotals,
    verifiedLabels: ['Admin Verified', 'Not Verified'],
    verifiedValues: [verified, stats.unverified]
  };

  const categoryList = (categories || []).map((c) => c.category).filter(Boolean);

  return {
    rows: enriched,
    stats,
    chartData,
    categoryList,
    filters,
    buildQuery: (overrides) => buildScmQueryString(filters, overrides)
  };
}

async function fetchSourceCodeScreenshotList(queryAsync, sourceCodeId, mainImage = '') {
  const rows = await queryAsync(
    `SELECT id, url, type, name FROM screenshots WHERE source_code_id = ? ORDER BY id`,
    [sourceCodeId]
  );
  const list = [];
  const mainImg = (mainImage && String(mainImage).trim()) || '';
  if (mainImg) {
    list.push({ url: mainImg, type: 'input_design', name: 'Main' });
  }
  for (const s of rows || []) {
    const url = (s.url && String(s.url).trim()) || '';
    if (!url) continue;
    if (mainImg && url === mainImg) continue;
    list.push({ url, type: s.type || 'input_design', name: s.name || '' });
  }
  return list;
}

module.exports = {
  TOTAL_DIAGRAMS,
  scmDemoOnlyIncompleteSql,
  computeSourceCodeScreenshotTotal,
  enrichSourceCodeRow,
  parseScmFilters,
  buildScmQueryString,
  buildScmWhere,
  fetchScmStats,
  resolveScmActiveNav,
  fetchScmDashboard,
  fetchSourceCodeScreenshotList
};
