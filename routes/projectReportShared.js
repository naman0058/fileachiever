'use strict';

const pool = require('./pool');
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);

const SOURCE_TABLE_DEGREE_LABEL = {
  btech_project: 'B.Tech',
  bca_project: 'BCA',
  mca_project: 'MCA',
  be_project: 'B.E.',
  me_project: 'M.E.',
  mtech_project: 'M.Tech',
  bsc_project: 'BSc',
  msc_project: 'MSc',
};

/** Default cap for affiliate “completed” dashboard (fast load). */
const SUCCESS_DASHBOARD_LIMIT = 100;

/** Only these tables have a CRM `status` column; legacy *\_project tables do not. */
const PROJECT_TABLES_WITH_STATUS = new Set(['btech_project']);

const PROJECT_REPORT_TABLES = Object.keys(SOURCE_TABLE_DEGREE_LABEL);

const LEGACY_FRONT_COLS = [
  'html', 'css', 'bootstrap', 'javascript', 'jquery', 'json', 'react', 'angular',
];
const LEGACY_BACK_COLS = ['php', 'nodejs', 'python', 'java'];

const PROJECT_REPORT_TYPE_MAPPING = {
  BCA: 'Bachelor of Computer Application',
  MCA: 'Master of Computer Application',
  'M.Tech': 'Master of Technology',
  'B.Tech': 'Bachelor of Technology',
  'B.E.': 'Bachelor of Engineering',
  'M.E.': 'Master of Engineering',
  BSc: 'Bachelor of Science',
  MSc: 'Master of Science',
};

function projectTypeLabel(reportType) {
  if (reportType == null || reportType === '') return '';
  return PROJECT_REPORT_TYPE_MAPPING[reportType] || reportType;
}

function safeTableName(t) {
  if (!t || typeof t !== 'string') return 'btech_project';
  return PROJECT_REPORT_TABLES.includes(t) ? t : 'btech_project';
}

async function findLatestProjectReport(rollNumber, preferredTable) {
  const roll = String(rollNumber == null ? '' : rollNumber).trim();
  if (!roll) return null;

  const fetchOne = async (table) => {
    const rows = await queryAsync('SELECT * FROM ?? WHERE roll_number = ? ORDER BY id DESC LIMIT 1', [
      table,
      roll,
    ]);
    return rows && rows[0] ? { table, row: rows[0] } : null;
  };

  if (preferredTable) {
    const t = safeTableName(preferredTable);
    const got = await fetchOne(t);
    if (got) return got;
  }
  let best = null;
  for (const t of PROJECT_REPORT_TABLES) {
    const got = await fetchOne(t);
    if (got && (!best || got.row.id > best.row.id)) best = got;
  }
  return best;
}

/**
 * Data shape expected by `views/B.Tech/finalnew.ejs` (result[0]..result[4]).
 */
async function buildBtechStyleReportResult(projRow, table) {
  const t = safeTableName(table);
  const projectId = projRow.projectid;
  if (projectId == null) {
    throw new Error('Missing projectid');
  }

  const prRows = await queryAsync('SELECT * FROM project WHERE id = ? LIMIT 1', [projectId]);
  if (!prRows || !prRows[0]) throw new Error('Project not found');
  const pr = prRows[0];

  const shotRows = await queryAsync(
    'SELECT * FROM screenshots WHERE source_code_id = (SELECT `assign` FROM project WHERE id = ? LIMIT 1)',
    [projectId]
  );
  const screenshots = (shotRows || []).filter((s) => s && s.url);

  let frontRows;
  let backRows;
  if (t === 'btech_project') {
    const frontIds = (projRow.frontend || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const backIds = (projRow.backend || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    frontRows = frontIds.length
      ? await queryAsync('SELECT * FROM programming_language WHERE id IN (?)', [frontIds])
      : [];
    backRows = backIds.length
      ? await queryAsync('SELECT * FROM programming_language WHERE id IN (?)', [backIds])
      : [];
  } else {
    const frontIds = LEGACY_FRONT_COLS.map((c) => projRow[c]).filter(Boolean);
    const backIds = LEGACY_BACK_COLS.map((c) => projRow[c]).filter(Boolean);
    frontRows = frontIds.length
      ? await queryAsync('SELECT * FROM programming_language WHERE id IN (?)', [frontIds])
      : [];
    backRows = backIds.length
      ? await queryAsync('SELECT * FROM programming_language WHERE id IN (?)', [backIds])
      : [];
  }

  const displayRow = { ...projRow };
  if (!displayRow.report_type && SOURCE_TABLE_DEGREE_LABEL[t]) {
    displayRow.report_type = SOURCE_TABLE_DEGREE_LABEL[t];
  }
  if (displayRow.project_type == null || displayRow.project_type === '') {
    displayRow.project_type = 'Major Project';
  }

  return [[displayRow], frontRows || [], backRows || [], [pr], screenshots];
}

function mapProjectReportRow(r, table) {
  return Object.assign({}, r, {
    source_table: table,
    email: r.email || '',
    report_type: r.report_type || SOURCE_TABLE_DEGREE_LABEL[table] || '—',
    project_type: r.project_type || '—',
  });
}

/** Sort key: `date` (YYYY-MM-DD) when present; ids are not comparable across tables. */
function parseRowSortMs(row) {
  const d = row && row.date;
  if (d) {
    const ms = Date.parse(String(d).trim());
    if (!Number.isNaN(ms)) return ms;
  }
  return 0;
}

function compareProjectRowsRecent(a, b) {
  const diff = parseRowSortMs(b) - parseRowSortMs(a);
  if (diff !== 0) return diff;
  return (b.id || 0) - (a.id || 0);
}

/** One recent row per table first, then fill up to `limit` (fair mix across source tables). */
function mergeBalancedRecent(tableRowLists, limit) {
  const lists = tableRowLists.filter((arr) => arr && arr.length);
  if (!lists.length) return [];
  const out = [];
  const idx = lists.map(() => 0);

  while (out.length < limit) {
    let added = false;
    for (let t = 0; t < lists.length; t++) {
      const list = lists[t];
      const i = idx[t];
      if (i < list.length) {
        out.push(list[i]);
        idx[t]++;
        added = true;
        if (out.length >= limit) break;
      }
    }
    if (!added) break;
  }

  out.sort(compareProjectRowsRecent);
  return out;
}

async function fetchRowsFromProjectTable(table, status, perTableLimit) {
  const hasStatusCol = PROJECT_TABLES_WITH_STATUS.has(table);

  if (!hasStatusCol) {
    /* Legacy tables: no status column — each row is a completed submission. */
    if (status !== 'success') return [];
    try {
      const rows = perTableLimit
        ? await queryAsync('SELECT * FROM ?? ORDER BY id DESC LIMIT ?', [table, perTableLimit])
        : await queryAsync('SELECT * FROM ?? ORDER BY id DESC', [table]);
      return (rows || []).map((r) =>
        mapProjectReportRow(Object.assign({}, r, { status: 'success' }), table)
      );
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') return [];
      console.error('fetchRowsFromProjectTable (legacy)', table, e);
      return [];
    }
  }

  try {
    const rows = perTableLimit
      ? await queryAsync('SELECT * FROM ?? WHERE status = ? ORDER BY id DESC LIMIT ?', [
          table,
          status,
          perTableLimit,
        ])
      : await queryAsync('SELECT * FROM ?? WHERE status = ? ORDER BY id DESC', [table, status]);
    return (rows || []).map((r) => mapProjectReportRow(r, table));
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return [];
    if (e.code === 'ER_BAD_FIELD_ERROR' && e.sqlMessage && e.sqlMessage.indexOf('status') !== -1) {
      PROJECT_TABLES_WITH_STATUS.delete(table);
      return fetchRowsFromProjectTable(table, status, perTableLimit);
    }
    console.error('fetchRowsFromProjectTable', table, e);
    return [];
  }
}

/**
 * Merged list for admin dashboards; each row has `source_table` for updates.
 * @param {object} [options] — `{ limit, perTableLimit, balanced }` for success dashboard slice.
 */
async function fetchProjectReportsByStatus(status, options) {
  const opts = options || {};
  const limit = opts.limit > 0 ? opts.limit : null;
  const tableCount = PROJECT_REPORT_TABLES.length;
  const balanced = opts.balanced !== false && !!limit;

  let perTableLimit = opts.perTableLimit > 0 ? opts.perTableLimit : null;
  if (limit && balanced) {
    perTableLimit = Math.max(2, Math.ceil(limit / tableCount));
  } else if (limit && !perTableLimit) {
    perTableLimit = limit;
  }

  const tableRowLists = await Promise.all(
    PROJECT_REPORT_TABLES.map((t) => fetchRowsFromProjectTable(t, status, perTableLimit))
  );

  let out;
  if (limit && balanced) {
    out = mergeBalancedRecent(tableRowLists, limit);
  } else {
    out = tableRowLists.flat();
    out.sort(compareProjectRowsRecent);
    if (limit) out = out.slice(0, limit);
  }
  return out;
}

const DETAIL_SKIP_KEYS = new Set([
  'password',
  'frontend',
  'backend',
  'html',
  'css',
  'bootstrap',
  'javascript',
  'jquery',
  'json',
  'react',
  'angular',
  'php',
  'nodejs',
  'python',
  'java',
]);

const DETAIL_FIELD_LABELS = {
  id: 'Record ID',
  source_table: 'Source table',
  name: 'Student name',
  email: 'Email address',
  number: 'Contact number',
  date: 'Submission date',
  report_type: 'Degree program',
  project_type: 'Project category',
  seo_name: 'Project title',
  roll_number: 'Roll number',
  college_name: 'College name',
  college_address: 'College address',
  affilated_college_name: 'Affiliated college',
  affilated_college_address: 'Affiliated college address',
  director_name: 'Director name',
  professor_name: 'Guide / Professor',
  hod_name: 'HOD name',
  semester: 'Semester',
  department: 'Department',
  projectid: 'Project template ID',
  friend: 'Team member 1',
  roll_number1: 'Member 1 roll no.',
  friend1: 'Team member 2',
  roll_number2: 'Member 2 roll no.',
  friend2: 'Team member 3',
  roll_number3: 'Member 3 roll no.',
  friend3: 'Team member 4',
  roll_number4: 'Member 4 roll no.',
  college_logo: 'College logo',
  affilated_college_logo: 'Affiliated college logo',
  status: 'Status',
  israting: 'Feedback status',
  view: 'Device / session',
  coupon_code: 'Coupon code',
  final_amount: 'Final amount paid',
};

function formatDetailValue(key, val) {
  if (val == null || val === '' || val === 'null' || val === 'undefined') return '';
  if (key === 'seo_name') {
    return String(val).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (key === 'college_logo' || key === 'affilated_college_logo') {
    const file = String(val).trim();
    if (!file) return '';
    return file;
  }
  return String(val).trim();
}

function labelForDetailKey(key) {
  if (DETAIL_FIELD_LABELS[key]) return DETAIL_FIELD_LABELS[key];
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildDetailSections(row, langNames, projectName) {
  const sections = [];

  const pushSection = (title, fields) => {
    const items = fields.filter((f) => f.value);
    if (items.length) sections.push({ title, fields: items });
  };

  pushSection('Student & contact', [
    { label: 'Student name', value: formatDetailValue('name', row.name) },
    { label: 'Email address', value: formatDetailValue('email', row.email) },
    { label: 'Contact number', value: formatDetailValue('number', row.number) },
    { label: 'Roll number', value: formatDetailValue('roll_number', row.roll_number) },
    { label: 'Submission date', value: formatDetailValue('date', row.date) },
  ]);

  pushSection('Academic & project', [
    { label: 'Degree program', value: formatDetailValue('report_type', row.report_type || row.degree_label) },
    { label: 'Source table', value: row.source_table || '' },
    { label: 'Project category', value: formatDetailValue('project_type', row.project_type) },
    { label: 'Project title', value: formatDetailValue('seo_name', row.seo_name) },
    { label: 'Catalog project name', value: projectName || '' },
    { label: 'Project template ID', value: row.projectid != null ? String(row.projectid) : '' },
    { label: 'Semester', value: formatDetailValue('semester', row.semester) },
    { label: 'Department', value: formatDetailValue('department', row.department) },
  ]);

  pushSection('College & affiliation', [
    { label: 'College name', value: formatDetailValue('college_name', row.college_name) },
    { label: 'College address', value: formatDetailValue('college_address', row.college_address) },
    { label: 'Affiliated college', value: formatDetailValue('affilated_college_name', row.affilated_college_name) },
    { label: 'Affiliated address', value: formatDetailValue('affilated_college_address', row.affilated_college_address) },
    {
      label: 'College logo',
      value: formatDetailValue('college_logo', row.college_logo),
      isFile: !!formatDetailValue('college_logo', row.college_logo),
    },
    {
      label: 'Affiliated logo',
      value: formatDetailValue('affilated_college_logo', row.affilated_college_logo),
      isFile: !!formatDetailValue('affilated_college_logo', row.affilated_college_logo),
    },
  ]);

  pushSection('Faculty', [
    { label: 'Director name', value: formatDetailValue('director_name', row.director_name) },
    { label: 'Guide / Professor', value: formatDetailValue('professor_name', row.professor_name) },
    { label: 'HOD name', value: formatDetailValue('hod_name', row.hod_name) },
  ]);

  const team = [];
  if (formatDetailValue('friend', row.friend)) {
    team.push({
      label: 'Team member 1',
      value: `${row.friend}${row.roll_number1 ? ' (' + row.roll_number1 + ')' : ''}`,
    });
  }
  if (formatDetailValue('friend1', row.friend1)) {
    team.push({
      label: 'Team member 2',
      value: `${row.friend1}${row.roll_number2 ? ' (' + row.roll_number2 + ')' : ''}`,
    });
  }
  if (formatDetailValue('friend2', row.friend2)) {
    team.push({
      label: 'Team member 3',
      value: `${row.friend2}${row.roll_number3 ? ' (' + row.roll_number3 + ')' : ''}`,
    });
  }
  if (formatDetailValue('friend3', row.friend3)) {
    team.push({
      label: 'Team member 4',
      value: `${row.friend3}${row.roll_number4 ? ' (' + row.roll_number4 + ')' : ''}`,
    });
  }
  if (team.length) pushSection('Team members', team);

  pushSection('Technology stack', [
    { label: 'Frontend', value: langNames.frontendNames.join(', ') || '—' },
    { label: 'Backend', value: langNames.backendNames.join(', ') || '—' },
  ]);

  pushSection('Order & system', [
    { label: 'Status', value: formatDetailValue('status', row.status) },
    { label: 'Record ID', value: row.id != null ? String(row.id) : '' },
    { label: 'Feedback status', value: formatDetailValue('israting', row.israting) },
    { label: 'Device / session', value: formatDetailValue('view', row.view) },
    { label: 'Coupon code', value: formatDetailValue('coupon_code', row.coupon_code) },
    { label: 'Final amount', value: formatDetailValue('final_amount', row.final_amount) },
  ]);

  const known = new Set([
    ...Object.keys(DETAIL_FIELD_LABELS),
    ...LEGACY_FRONT_COLS,
    ...LEGACY_BACK_COLS,
    'degree_label',
    'project_name',
    'frontend_names',
    'backend_names',
    'detail_sections',
  ]);
  const extra = [];
  for (const key of Object.keys(row)) {
    if (known.has(key) || DETAIL_SKIP_KEYS.has(key)) continue;
    const value = formatDetailValue(key, row[key]);
    if (value) extra.push({ label: labelForDetailKey(key), value });
  }
  if (extra.length) pushSection('Additional fields', extra);

  return sections;
}

async function resolveLangNames(projRow, table) {
  const t = safeTableName(table);
  let frontIds = [];
  let backIds = [];
  if (t === 'btech_project') {
    frontIds = String(projRow.frontend || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    backIds = String(projRow.backend || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    frontIds = LEGACY_FRONT_COLS.map((c) => projRow[c]).filter(Boolean);
    backIds = LEGACY_BACK_COLS.map((c) => projRow[c]).filter(Boolean);
  }
  const allIds = [...new Set([...frontIds, ...backIds].map((id) => String(id)))];
  const nameById = {};
  if (allIds.length) {
    const rows = await queryAsync('SELECT id, name FROM programming_language WHERE id IN (?)', [allIds]);
    for (const r of rows || []) nameById[String(r.id)] = r.name;
  }
  return {
    frontendNames: frontIds.map((id) => nameById[id] || id),
    backendNames: backIds.map((id) => nameById[id] || id),
  };
}

async function enrichProjectReportsForDashboard(rows) {
  const enriched = [];
  for (const row of rows) {
    const t = safeTableName(row.source_table);
    let projectName = '';
    if (row.projectid != null) {
      try {
        const pr = await queryAsync('SELECT name FROM project WHERE id = ? LIMIT 1', [row.projectid]);
        if (pr && pr[0]) projectName = pr[0].name || '';
      } catch (e) {
        console.error('enrichProjectReports project lookup', e);
      }
    }
    const langNames = await resolveLangNames(row, t);
    const degree_label = SOURCE_TABLE_DEGREE_LABEL[t] || t;
    const detail_sections = buildDetailSections(
      Object.assign({}, row, { degree_label }),
      langNames,
      projectName
    );
    enriched.push(
      Object.assign({}, row, {
        degree_label,
        project_name: projectName,
        frontend_names: langNames.frontendNames.join(', ') || '—',
        backend_names: langNames.backendNames.join(', ') || '—',
        detail_sections,
      })
    );
  }
  return enriched;
}

function buildReportStats(rows) {
  const byDegree = {};
  let feedbackSent = 0;
  for (const r of rows) {
    const deg = r.degree_label || r.report_type || 'Other';
    byDegree[deg] = (byDegree[deg] || 0) + 1;
    if (r.israting === 'send') feedbackSent += 1;
  }
  return {
    total: rows.length,
    byDegree,
    feedbackSent,
    pendingFeedback: rows.length - feedbackSent,
  };
}

/**
 * SEO-friendly report slug: strip trailing "-final..." (and everything after).
 * e.g. eye-care-management-system-final-year-project → eye-care-management-system
 * Leaves titles that start with "final-..." intact.
 */
function cleanReportSeoSlug(seo) {
  let s = String(seo == null ? '' : seo).toLowerCase().trim();
  if (!s) return '';
  const idx = s.lastIndexOf('-final');
  if (idx > 0) {
    s = s.slice(0, idx);
  }
  return s.replace(/-+$/g, '');
}

/**
 * Resolve source_code row by exact report URL slug (database seo_name).
 */
async function findSourceCodeByReportSeo(seoSlug) {
  const name = String(seoSlug == null ? '' : seoSlug).toLowerCase().trim();
  if (!name) return [];

  const rows = await queryAsync('SELECT * FROM source_code WHERE seo_name = ? LIMIT 1', [name]);
  return rows && rows.length ? rows : [];
}

const REPORT_CATALOG_DEGREES = ['btech', 'mtech', 'be', 'me', 'bca', 'mca', 'bsc', 'msc'];

const REPORT_CATALOG_DEGREE_LABELS = {
  btech: 'B.Tech',
  mtech: 'M.Tech',
  be: 'B.E.',
  me: 'M.E.',
  bca: 'BCA',
  mca: 'MCA',
  bsc: 'BSc',
  msc: 'MSc',
};

function normalizeReportDegreeSlug(slug) {
  return String(slug || '').trim().toLowerCase().replace(/\./g, '');
}

/** Extract DB seo slug from /{slug}-report or /{slug}-report-{degree} path. */
function parseReportDetailPathSlug(reqPath) {
  const p = String(reqPath || '').replace(/^\//, '').replace(/\/edit$/i, '');
  const withDegree = p.match(/^(.+)-report-(btech|mtech|be|me|bca|mca|bsc|msc)$/i);
  if (withDegree) return withDegree[1].toLowerCase();
  const plain = p.match(/^(.+)-report$/i);
  if (plain) return plain[1].toLowerCase();
  return p.toLowerCase();
}

function degreeSlugToLabel(degreeSlug) {
  const s = normalizeReportDegreeSlug(degreeSlug);
  return REPORT_CATALOG_DEGREE_LABELS[s] || '';
}

/** New canonical report detail URL: /{seo_name}-report or /{seo_name}-report-{degree} */
function projectReportUrl(seoName, degreeSlug) {
  const slug = resolveProjectReportSeoSlug(seoName);
  if (!slug) return '/final-year-project-ideas';
  const deg = normalizeReportDegreeSlug(degreeSlug);
  if (deg && isReportCatalogDegree(deg)) {
    return `/${slug}-report-${deg}`;
  }
  return `/${slug}-report`;
}

/** Canonical slug fixes when old URLs pointed at duplicate/legacy seo_name values. */
const PROJECT_REPORT_SLUG_REDIRECTS = {
  'email-spam-detection-system': 'email-spam-detection',
  'blood-bank-&-donor-management-system-using-php-and-mysql': 'blood-bank-and-donor-management-system',
  'client-management-system-using-php-&-mysql': 'client-management-system-using-php-and-mysql',
  'cyber-cafe-management-system-using-php-&-mysql': 'cyber-cafe-management-system-using-php-and-mysql',
  'student-result-management-system-using-php-&-mysql': 'student-result-management-system-using-php-and-mysql',
  'user-registration-&-login-and-user-management-system-with-admin-panel': 'user-registration-and-login-and-user-management-system-with-admin-panel',
  'employee-leaves-management-system-(elms)': 'employee-leave-management-system',
};

function resolveProjectReportSeoSlug(seoName) {
  const slug = String(seoName || '').trim().toLowerCase();
  return PROJECT_REPORT_SLUG_REDIRECTS[slug] || slug;
}

/**
 * Resolve legacy URL slug to canonical DB seo_name (never strip -final-year-project).
 */
async function resolveReportSeoFromLegacySlug(seoSlug) {
  const raw = resolveProjectReportSeoSlug(seoSlug);
  if (!raw) return '';

  const candidates = [
    raw,
    `${raw}-final-year-project`,
    `${raw}-final-year-php-project`,
    `${raw}-final-year-mern-project`,
  ];

  for (const slug of candidates) {
    const rows = await queryAsync('SELECT seo_name FROM source_code WHERE seo_name = ? LIMIT 1', [slug]);
    if (rows && rows.length) return rows[0].seo_name;
  }

  const prefixRows = await queryAsync(
    `SELECT seo_name FROM source_code
     WHERE seo_name LIKE ?
     ORDER BY CHAR_LENGTH(seo_name) DESC
     LIMIT 1`,
    [`${raw}-final%`]
  );
  if (prefixRows && prefixRows.length) return prefixRows[0].seo_name;

  return raw;
}

/** If URL slug is partial/legacy, resolve to exact DB seo_name; otherwise return input. */
async function resolveCanonicalReportSeo(seoSlug) {
  const raw = resolveProjectReportSeoSlug(seoSlug);
  if (!raw) return '';

  const exact = await queryAsync('SELECT seo_name FROM source_code WHERE seo_name = ? LIMIT 1', [raw]);
  if (exact && exact.length) return exact[0].seo_name;

  return resolveReportSeoFromLegacySlug(raw);
}

/** 301 when /{partial-slug}-report should be /{db_seo_name}-report (optional -{degree}) */
async function canonicalReportUrlRedirect(req) {
  const p = req.path;
  const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';

  let m = p.match(/^\/([^/]+)-report-(btech|mtech|be|me|bca|mca|bsc|msc)(\/edit)?$/i);
  if (m) {
    const urlSlug = m[1].toLowerCase();
    const degree = m[2].toLowerCase();
    if (isReportCatalogSeoName(urlSlug)) return null;

    const exact = await queryAsync('SELECT seo_name FROM source_code WHERE seo_name = ? LIMIT 1', [urlSlug]);
    if (exact && exact.length) return null;

    const canonical = await resolveReportSeoFromLegacySlug(urlSlug);
    if (!canonical || canonical === urlSlug) return null;

    const targetBase = projectReportUrl(canonical, degree);
    const target = m[3] ? `${targetBase}/edit` : targetBase;
    if (target === p) return null;
    return target + q;
  }

  m = p.match(/^\/([^/]+)-report(\/edit)?$/i);
  if (!m) return null;

  const urlSlug = m[1].toLowerCase();
  if (!urlSlug || isReportCatalogDegree(urlSlug) || isReportCatalogSeoName(urlSlug)) return null;

  const exact = await queryAsync('SELECT seo_name FROM source_code WHERE seo_name = ? LIMIT 1', [urlSlug]);
  if (exact && exact.length) return null;

  const canonical = await resolveReportSeoFromLegacySlug(urlSlug);
  if (!canonical || canonical === urlSlug) return null;

  const targetBase = projectReportUrl(canonical);
  const target = m[2] ? `${targetBase}/edit` : targetBase;
  if (target === p) return null;
  return target + q;
}

function isReportCatalogSeoName(seoName) {
  const s = String(seoName || '').trim().toLowerCase();
  return REPORT_CATALOG_DEGREES.some((d) => s === `${d}-final-year-project`);
}

function isReportCatalogDegree(slug) {
  return REPORT_CATALOG_DEGREES.includes(String(slug || '').trim().toLowerCase().replace(/\./g, ''));
}

/**
 * 301 target for legacy report detail URLs (/final-year-project-report-* and degree-prefixed).
 * Returns null when path is not a legacy report detail URL.
 */
async function legacyProjectReportRedirect(req) {
  const p = req.path;
  const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';

  let m = p.match(/^\/final-year-project-report-([^/]+)(\/edit)?$/i);
  if (m) {
    const seo = await resolveReportSeoFromLegacySlug(m[1]);
    if (m[2]) {
      const plan = String(req.query.type || '').toLowerCase() === 'synopsis' ? 'synopsis' : 'report';
      return `/checkout?type=report&seo=${encodeURIComponent(seo)}&plan=${plan}`;
    }
    return projectReportUrl(seo) + q;
  }

  m = p.match(/^\/(btech|mtech|be|me|bca|mca|bsc|msc)-final-year-project-report-([^/]+)(\/edit)?$/i);
  if (m) {
    const degree = m[1].toLowerCase();
    const seo = await resolveReportSeoFromLegacySlug(m[2]);
    if (m[3]) {
      const plan = String(req.query.type || '').toLowerCase() === 'synopsis' ? 'synopsis' : 'report';
      return `/checkout?type=report&seo=${encodeURIComponent(seo)}&plan=${plan}`;
    }
    return projectReportUrl(seo, degree) + q;
  }

  m = p.match(/^\/(.+)-final-year-project-report-([^/]+)(\/edit)?$/i);
  if (m) {
    const prefix = m[1].toLowerCase().replace(/\./g, '');
    const tail = m[2].toLowerCase().replace(/\./g, '');
    if (!REPORT_CATALOG_DEGREES.includes(prefix)) {
      // /{seo_name}-report-{degree} when seo_name ends with -final-year-project
      if (REPORT_CATALOG_DEGREES.includes(tail)) {
        return null;
      }
      const seo = await resolveReportSeoFromLegacySlug(m[2]);
      if (m[3]) {
        const plan = String(req.query.type || '').toLowerCase() === 'synopsis' ? 'synopsis' : 'report';
        return `/checkout?type=report&seo=${encodeURIComponent(seo)}&plan=${plan}`;
      }
      return projectReportUrl(seo) + q;
    }
  }

  return null;
}

module.exports = {
  SOURCE_TABLE_DEGREE_LABEL,
  PROJECT_REPORT_TABLES,
  PROJECT_TABLES_WITH_STATUS,
  SUCCESS_DASHBOARD_LIMIT,
  findLatestProjectReport,
  buildBtechStyleReportResult,
  fetchProjectReportsByStatus,
  enrichProjectReportsForDashboard,
  buildReportStats,
  projectTypeLabel,
  safeTableName,
  cleanReportSeoSlug,
  findSourceCodeByReportSeo,
  projectReportUrl,
  resolveProjectReportSeoSlug,
  resolveReportSeoFromLegacySlug,
  resolveCanonicalReportSeo,
  canonicalReportUrlRedirect,
  legacyProjectReportRedirect,
  isReportCatalogSeoName,
  isReportCatalogDegree,
  REPORT_CATALOG_DEGREES,
  REPORT_CATALOG_DEGREE_LABELS,
  degreeSlugToLabel,
  normalizeReportDegreeSlug,
  parseReportDetailPathSlug,
  PROJECT_REPORT_SLUG_REDIRECTS,
};
