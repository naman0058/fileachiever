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
};

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

  return [[displayRow], frontRows || [], backRows || [], [pr], shotRows || []];
}

/**
 * Merged list for admin dashboards; each row has `source_table` for updates.
 */
async function fetchProjectReportsByStatus(status) {
  const out = [];
  for (const t of PROJECT_REPORT_TABLES) {
    try {
      const rows = await queryAsync('SELECT * FROM ?? WHERE status = ? ORDER BY id DESC', [t, status]);
      for (const r of rows) {
        out.push(
          Object.assign({}, r, {
            source_table: t,
            email: r.email || '',
            report_type: r.report_type || SOURCE_TABLE_DEGREE_LABEL[t] || '—',
            project_type: r.project_type || '—',
          })
        );
      }
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR' && e.sqlMessage && e.sqlMessage.indexOf('status') !== -1) {
        try {
          const rows = await queryAsync('SELECT * FROM ?? ORDER BY id DESC LIMIT 500', [t]);
          for (const r of rows) {
            const st =
              r.status !== undefined && r.status !== null && r.status !== '' ? r.status : 'pending';
            if (st !== status) continue;
            out.push(
              Object.assign({}, r, {
                source_table: t,
                email: r.email || '',
                report_type: r.report_type || SOURCE_TABLE_DEGREE_LABEL[t] || '—',
                project_type: r.project_type || '—',
              })
            );
          }
        } catch (e2) {
          console.error('fetchProjectReportsByStatus (fallback)', t, e2);
        }
      } else {
        console.error('fetchProjectReportsByStatus', t, e);
      }
    }
  }
  out.sort((a, b) => b.id - a.id);
  return out;
}

module.exports = {
  SOURCE_TABLE_DEGREE_LABEL,
  PROJECT_REPORT_TABLES,
  findLatestProjectReport,
  buildBtechStyleReportResult,
  fetchProjectReportsByStatus,
  projectTypeLabel,
  safeTableName,
};
