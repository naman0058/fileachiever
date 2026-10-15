'use strict';

const { auditReportToc } = require('./prmReportToc');

/**
 * Load sections + subheadings (+ screenshot counts) for many source_code ids.
 * @returns {Map<number, { sections: Array, screenshotCount: number }>}
 */
async function loadReportBundles(queryAsync, sourceIds) {
  const map = new Map();
  const ids = [...new Set((sourceIds || []).map((id) => parseInt(id, 10)).filter(Number.isFinite))];
  if (!ids.length) return map;

  ids.forEach((id) => map.set(id, { sections: [], screenshotCount: 0 }));

  const ph = ids.map(() => '?').join(',');
  const sections = await queryAsync(
    `SELECT id, source_code_id, heading, sort_order
     FROM source_code_report_sections
     WHERE source_code_id IN (${ph})
     ORDER BY source_code_id, sort_order ASC, id ASC`,
    ids
  );

  const sectionIds = (sections || []).map((s) => s.id);
  let subs = [];
  if (sectionIds.length) {
    const sph = sectionIds.map(() => '?').join(',');
    subs = await queryAsync(
      `SELECT section_id, subheading, body, sort_order
       FROM source_code_report_subheadings
       WHERE section_id IN (${sph})
       ORDER BY section_id, sort_order ASC, id ASC`,
      sectionIds
    );
  }

  const subsBySection = {};
  (subs || []).forEach((sh) => {
    if (!subsBySection[sh.section_id]) subsBySection[sh.section_id] = [];
    subsBySection[sh.section_id].push({
      subheading: sh.subheading || '',
      body: sh.body || '',
    });
  });

  (sections || []).forEach((s) => {
    const bundle = map.get(s.source_code_id);
    if (!bundle) return;
    bundle.sections.push({
      heading: s.heading || '',
      subheadings: subsBySection[s.id] || [],
    });
  });

  const shotRows = await queryAsync(
    `SELECT source_code_id, COUNT(*) AS c FROM screenshots WHERE source_code_id IN (${ph}) GROUP BY source_code_id`,
    ids
  ).catch(() => []);
  (shotRows || []).forEach((r) => {
    const bundle = map.get(r.source_code_id);
    if (bundle) bundle.screenshotCount = Number(r.c) || 0;
  });

  return map;
}

async function loadReportBundle(queryAsync, sourceId) {
  const map = await loadReportBundles(queryAsync, [sourceId]);
  return map.get(parseInt(sourceId, 10)) || { sections: [], screenshotCount: 0 };
}

function summarizeTocAudit(audit) {
  const preview = (audit.missing || []).slice(0, 4).map((m) => m.label);
  return {
    tocTotal: audit.total,
    tocCompleteCount: audit.completeCount,
    tocMissingCount: audit.missingCount,
    tocPct: audit.pct,
    isTocComplete: audit.isTocComplete,
    tocMissingPreview: preview,
  };
}

async function auditSourceCodeToc(queryAsync, sourceId) {
  const bundle = await loadReportBundle(queryAsync, sourceId);
  const audit = auditReportToc(bundle.sections, { screenshotCount: bundle.screenshotCount });
  return { ...audit, screenshotCount: bundle.screenshotCount };
}

async function attachTocAuditToRows(queryAsync, rows) {
  if (!rows || !rows.length) return rows;
  const map = await loadReportBundles(
    queryAsync,
    rows.map((r) => r.id)
  );
  return rows.map((r) => {
    const bundle = map.get(r.id) || { sections: [], screenshotCount: 0 };
    const audit = auditReportToc(bundle.sections, { screenshotCount: bundle.screenshotCount });
    return { ...r, ...summarizeTocAudit(audit) };
  });
}

module.exports = {
  loadReportBundles,
  loadReportBundle,
  auditSourceCodeToc,
  attachTocAuditToRows,
  summarizeTocAudit,
};
