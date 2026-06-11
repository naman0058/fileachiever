/**
 * Project Report Manager — shared filters, stats, enrichment & chart data.
 */
const MIN_PRM_HEADINGS = 10;

function sectionCountSubquery() {
  return `(SELECT COUNT(*) FROM source_code_report_sections WHERE source_code_id = sc.id)`;
}

function enrichPrmRow(r, minHeadings = MIN_PRM_HEADINGS) {
  const reportSectionCount = parseInt(r.report_section_count || 0, 10);
  const hasEnoughHeadings = reportSectionCount >= minHeadings;
  const missingCount = Math.max(0, minHeadings - reportSectionCount);
  const completionPct = Math.min(100, Math.round((reportSectionCount / minHeadings) * 100));
  const isVerified = !!(r.prm_report_verified);
  const isFullyComplete = hasEnoughHeadings;
  const missing = [];
  if (!hasEnoughHeadings) missing.push('headings');
  if (reportSectionCount === 0) missing.push('empty');

  return {
    ...r,
    reportSectionCount,
    hasEnoughHeadings,
    needsHeadings: !hasEnoughHeadings,
    missingCount,
    completionPct,
    isVerified,
    isFullyComplete,
    missing,
    isEmpty: reportSectionCount === 0,
    isPartial: reportSectionCount > 0 && reportSectionCount < minHeadings
  };
}

function parsePrmFilters(query = {}) {
  return {
    tab: (query.tab || 'all').toString(),
    q: (query.q || '').toString().trim(),
    category: (query.category || '').toString().trim(),
    missing: (query.missing || 'all').toString(),
    verified: (query.verified || 'all').toString(),
    sort: (query.sort || 'id_desc').toString()
  };
}

function buildPrmQueryString(filters, overrides = {}) {
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

function buildPrmWhere(filters, minHeadings = MIN_PRM_HEADINGS) {
  const where = ['1=1'];
  const params = [];
  const cnt = sectionCountSubquery();

  if (filters.tab === 'pending') {
    where.push(`${cnt} < ?`);
    params.push(minHeadings);
  } else if (filters.tab === 'complete') {
    where.push(`${cnt} >= ?`);
    params.push(minHeadings);
  } else if (filters.tab === 'verified') {
    where.push(`sc.prm_report_verified = 1`);
  } else if (filters.tab === 'unverified') {
    where.push(`(sc.prm_report_verified IS NULL OR sc.prm_report_verified = 0)`);
  }

  if (filters.missing === 'none' || filters.missing === 'empty') {
    where.push(`${cnt} = 0`);
  } else if (filters.missing === 'partial') {
    where.push(`${cnt} > 0 AND ${cnt} < ?`);
    params.push(minHeadings);
  } else if (filters.missing === 'headings') {
    where.push(`${cnt} < ?`);
    params.push(minHeadings);
  }

  if (filters.verified === 'verified') {
    where.push(`sc.prm_report_verified = 1`);
  } else if (filters.verified === 'unverified') {
    where.push(`(sc.prm_report_verified IS NULL OR sc.prm_report_verified = 0)`);
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

function buildPrmOrderBy(sort) {
  switch (sort) {
    case 'name_asc': return 'sc.name ASC';
    case 'gaps_desc': return 'missing_score DESC, sc.id DESC';
    case 'completion_asc': return 'completion_score ASC, sc.id DESC';
    case 'completion_desc': return 'completion_score DESC, sc.id DESC';
    case 'headings_asc': return 'report_section_count ASC, sc.id DESC';
    default: return 'sc.id DESC';
  }
}

function resolvePrmActiveNav(filters) {
  if (!filters) return 'overview';
  if (filters.tab === 'pending') return 'gaps';
  if (filters.tab === 'complete') return 'complete';
  if (filters.tab === 'verified') return 'verified';
  if (filters.tab === 'unverified') return 'unverified';
  if (filters.missing === 'empty' || filters.missing === 'none') return 'missing-empty';
  if (filters.missing === 'partial') return 'missing-partial';
  if (filters.missing === 'headings') return 'gaps';
  return 'overview';
}

async function fetchPrmStats(queryAsync, minHeadings = MIN_PRM_HEADINGS) {
  const cnt = sectionCountSubquery();
  const [totalRow, completeRow, verifiedRow, emptyRow, partialRow] = await Promise.all([
    queryAsync(`SELECT COUNT(*) AS c FROM source_code`),
    queryAsync(`SELECT COUNT(*) AS c FROM source_code sc WHERE ${cnt} >= ?`, [minHeadings]),
    queryAsync(`SELECT COUNT(*) AS c FROM source_code WHERE prm_report_verified = 1`),
    queryAsync(`SELECT COUNT(*) AS c FROM source_code sc WHERE ${cnt} = 0`),
    queryAsync(`SELECT COUNT(*) AS c FROM source_code sc WHERE ${cnt} > 0 AND ${cnt} < ?`, [minHeadings])
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
    minHeadings,
    gaps: {
      empty: emptyRow[0]?.c || 0,
      partial: partialRow[0]?.c || 0,
      incomplete: pending
    }
  };
}

async function fetchPrmDashboard(queryAsync, filters, options = {}) {
  const minHeadings = options.minHeadings || MIN_PRM_HEADINGS;
  const limit = options.limit || 500;
  const { where, params } = buildPrmWhere(filters, minHeadings);
  const orderBy = buildPrmOrderBy(filters.sort);
  const cnt = sectionCountSubquery();

  const needsScore = ['gaps_desc', 'completion_asc', 'completion_desc'].includes(filters.sort);
  const scoreSelect = needsScore ? `,
    LEAST(${cnt}, ${minHeadings}) AS completion_score,
    (${minHeadings} - LEAST(${cnt}, ${minHeadings})) AS missing_score` : '';

  const rows = await queryAsync(
    `SELECT sc.id, sc.name, sc.seo_name, sc.category, sc.prm_report_verified,
      ${cnt} AS report_section_count
      ${scoreSelect}
     FROM source_code sc
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT ${Number(limit) || 500}`,
    params
  );

  const enriched = (rows || []).map((r) => enrichPrmRow(r, minHeadings));
  const [stats, categories] = await Promise.all([
    fetchPrmStats(queryAsync, minHeadings),
    queryAsync(`SELECT category, COUNT(*) AS total FROM source_code WHERE category IS NOT NULL AND category != '' GROUP BY category ORDER BY total DESC LIMIT 12`)
  ]);

  const chartData = {
    completionLabels: ['Complete (10+ headings)', 'Incomplete'],
    completionValues: [stats.complete, stats.pending],
    gapLabels: ['No headings', 'Partial (1–9)', 'Incomplete total'],
    gapValues: [stats.gaps.empty, stats.gaps.partial, stats.gaps.incomplete],
    categoryLabels: (categories || []).map((c) => c.category || 'Other'),
    categoryTotals: (categories || []).map((c) => c.total || 0),
    verifiedLabels: ['Admin Verified', 'Not Verified'],
    verifiedValues: [stats.verified, stats.unverified]
  };

  return {
    rows: enriched,
    stats,
    chartData,
    categoryList: (categories || []).map((c) => c.category).filter(Boolean),
    filters,
    minHeadings,
    buildQuery: (overrides) => buildPrmQueryString(filters, overrides)
  };
}

module.exports = {
  MIN_PRM_HEADINGS,
  enrichPrmRow,
  parsePrmFilters,
  buildPrmQueryString,
  buildPrmWhere,
  resolvePrmActiveNav,
  fetchPrmStats,
  fetchPrmDashboard
};
