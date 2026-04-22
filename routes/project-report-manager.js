/**
 * Project Report Manager Portal - headings, subheadings, body per source code
 * Minimum 10 headings required per source code
 * Admin can verify completed work
 */
const express = require('express');
const path = require('path');
const router = express.Router();
const pool = require('./pool');
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);
const { buildFullReportItems } = require('./prc-build-full-report-items');
const { handleProjectReportWordDownload } = require('./project-report-creator');

router.use(express.static(path.join(__dirname, '../public/setup-support'), { maxAge: '1d' }));

const ADMIN_ROLES = new Set(['admin', 'administrator', 'superadmin']);
const MIN_HEADINGS_REQUIRED = 10;

function getUser(req) {
  if (req.session?.adminid) {
    return { id: req.session.adminid, name: 'Admin', role: 'admin' };
  }
  if (req.user) return req.user;
  if (req.session?.user) return req.session.user;
  return null;
}

function requirePRMLogin(req, res, next) {
  const u = getUser(req);
  if (!u) return res.redirect('/project-report-manager/login');
  const role = String(u.role || '').trim().toLowerCase();
  if (role !== 'project_report_manager') return res.redirect('/project-report-manager/login');
  req._user = u;
  next();
}

function requirePRMOrAdmin(req, res, next) {
  const u = getUser(req);
  if (!u) return res.redirect('/project-report-manager/login');
  const role = String(u.role || '').trim().toLowerCase();
  if (role === 'project_report_manager' || ADMIN_ROLES.has(role)) {
    req._user = u;
    return next();
  }
  return res.redirect('/project-report-manager/login');
}

// Login
router.get('/login', (req, res) => {
  if (getUser(req) && String(getUser(req).role || '').toLowerCase() === 'project_report_manager') {
    return res.redirect('/project-report-manager');
  }
  res.render('project-report-manager/login', { error: '' });
});

router.post('/login', async (req, res) => {
  try {
    const email = (req.body.email || '').toString().trim();
    const password = (req.body.password || '').toString().trim();
    if (!email || !password) {
      return res.render('project-report-manager/login', { error: 'Email and password required.' });
    }
    const rows = await queryAsync(
      `SELECT id, name, role, is_active FROM crm_users WHERE email=? AND password=? LIMIT 1`,
      [email, password]
    );
    if (!rows.length) {
      return res.render('project-report-manager/login', { error: 'Invalid credentials.' });
    }
    const r = rows[0];
    if (String(r.role || '').trim().toLowerCase() !== 'project_report_manager') {
      return res.render('project-report-manager/login', { error: 'This login is for Project Report Managers only.' });
    }
    if (!r.is_active) {
      return res.render('project-report-manager/login', { error: 'Account disabled. Contact administrator.' });
    }
    req.session.user = { id: r.id, name: r.name, role: String(r.role || '').trim() };
    return res.redirect('/project-report-manager');
  } catch (e) {
    return res.render('project-report-manager/login', { error: 'Server error.' });
  }
});

router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/project-report-manager/login');
});

// Dashboard - list all source_code with report section counts
router.get('/', requirePRMOrAdmin, async (req, res) => {
  try {
    const tab = (req.query.tab || 'all').toString();
    const q = (req.query.q || '').toString().trim();
    let where = ['1=1'];
    const params = [];

    if (tab === 'pending') {
      where.push(`(SELECT COUNT(*) FROM source_code_report_sections WHERE source_code_id = sc.id) < ?`);
      params.push(MIN_HEADINGS_REQUIRED);
    } else if (tab === 'complete') {
      where.push(`(SELECT COUNT(*) FROM source_code_report_sections WHERE source_code_id = sc.id) >= ?`);
      params.push(MIN_HEADINGS_REQUIRED);
    }

    if (q) {
      where.push(`(sc.name LIKE ? OR sc.seo_name LIKE ? OR sc.description LIKE ?)`);
      const like = `%${q.replace(/%/g, '\\%')}%`;
      params.push(like, like, like);
    }

    const rows = await queryAsync(`
      SELECT sc.id, sc.name, sc.seo_name, sc.category, sc.prm_report_verified,
        (SELECT COUNT(*) FROM source_code_report_sections WHERE source_code_id = sc.id) AS report_section_count
      FROM source_code sc
      WHERE ${where.join(' AND ')}
      ORDER BY sc.id DESC
      LIMIT 500
    `, params);

    const enriched = rows.map(r => {
      const count = parseInt(r.report_section_count || 0, 10);
      const hasEnoughHeadings = count >= MIN_HEADINGS_REQUIRED;
      return {
        ...r,
        reportSectionCount: count,
        hasEnoughHeadings,
        needsHeadings: count < MIN_HEADINGS_REQUIRED,
        missingCount: Math.max(0, MIN_HEADINGS_REQUIRED - count)
      };
    });

    const [pendingResult, completeResult, totalResult] = await Promise.all([
      queryAsync(`SELECT COUNT(*) AS c FROM source_code sc WHERE (SELECT COUNT(*) FROM source_code_report_sections WHERE source_code_id = sc.id) < ?`, [MIN_HEADINGS_REQUIRED]),
      queryAsync(`SELECT COUNT(*) AS c FROM source_code sc WHERE (SELECT COUNT(*) FROM source_code_report_sections WHERE source_code_id = sc.id) >= ?`, [MIN_HEADINGS_REQUIRED]),
      queryAsync(`SELECT COUNT(*) AS c FROM source_code`)
    ]);

    const stats = {
      total: totalResult[0]?.c || 0,
      pending: pendingResult[0]?.c || 0,
      complete: completeResult[0]?.c || 0
    };

    const filters = { tab, q };
    const buildQuery = (t) => {
      const p = new URLSearchParams();
      if (t !== 'all') p.set('tab', t);
      if (q) p.set('q', q);
      return p.toString();
    };

    return res.render('project-report-manager/dashboard', {
      pageTitle: 'Project Report Manager',
      user: req._user,
      rows: enriched,
      stats,
      filters,
      buildQuery,
      minHeadings: MIN_HEADINGS_REQUIRED
    });
  } catch (e) {
    console.error('Project Report Manager dashboard error:', e);
    res.status(500).send('Failed to load dashboard.');
  }
});

// Edit form - add/edit headings, subheadings, body
router.get('/edit/:id', requirePRMOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.redirect('/project-report-manager?error=Invalid id');
    const rows = await queryAsync(`SELECT sc.* FROM source_code sc WHERE sc.id = ? LIMIT 1`, [id]);
    if (!rows.length) return res.redirect('/project-report-manager?error=Not found');
    const sc = rows[0];
    if (!sc.description && sc.short_description) sc.description = sc.short_description;

    const sections = await queryAsync(
      `SELECT id, sort_order, heading FROM source_code_report_sections WHERE source_code_id = ? ORDER BY sort_order ASC, id ASC`,
      [id]
    );
    const subheadings = await queryAsync(
      `SELECT id, section_id, sort_order, subheading, body FROM source_code_report_subheadings WHERE section_id IN (SELECT id FROM source_code_report_sections WHERE source_code_id = ?) ORDER BY section_id, sort_order ASC, id ASC`,
      [id]
    );
    const subheadingsBySection = {};
    (subheadings || []).forEach(sh => {
      if (!subheadingsBySection[sh.section_id]) subheadingsBySection[sh.section_id] = [];
      subheadingsBySection[sh.section_id].push({ id: sh.id, subheading: sh.subheading || '', body: sh.body || '' });
    });
    const sectionsWithSubheadings = (sections || []).map(s => ({
      id: s.id,
      heading: s.heading || '',
      subheadings: subheadingsBySection[s.id] || []
    }));
    // Backward compat: legacy sections with subheading/body in main table
    const legacySections = await queryAsync(
      `SELECT id, subheading, body FROM source_code_report_sections WHERE source_code_id = ? AND (subheading IS NOT NULL OR body IS NOT NULL)`,
      [id]
    );
    const legacyBySection = {};
    (legacySections || []).forEach(s => { legacyBySection[s.id] = { subheading: s.subheading || '', body: s.body || '' }; });
    sectionsWithSubheadings.forEach(s => {
      if (s.subheadings.length === 0 && legacyBySection[s.id]) {
        s.subheadings = [{ id: null, subheading: legacyBySection[s.id].subheading, body: legacyBySection[s.id].body }];
      }
    });

    return res.render('project-report-manager/edit', {
      pageTitle: 'Edit Report Sections',
      user: req._user,
      sc,
      sections: sectionsWithSubheadings || [],
      minHeadings: MIN_HEADINGS_REQUIRED,
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (e) {
    console.error('Edit report sections error:', e);
    res.redirect('/project-report-manager?error=Failed to load.');
  }
});

// API: Save report section
router.post('/api/:id/sections', requirePRMOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sortOrder = parseInt(req.body.sort_order || 0, 10);
    const heading = (req.body.heading || '').toString().trim();
    const subheading = (req.body.subheading || '').toString().trim();
    const body = (req.body.body ?? '').toString();
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    if (!heading) return res.status(400).json({ ok: false, message: 'Heading required' });
    await queryAsync(
      `INSERT INTO source_code_report_sections (source_code_id, sort_order, heading, subheading, body) VALUES (?, ?, ?, ?, ?)`,
      [id, sortOrder, heading, subheading, body]
    );
    return res.json({ ok: true, added: 1 });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// API: Update report section
router.put('/api/:id/sections/:sid', requirePRMOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sid = parseInt(req.params.sid, 10);
    const sortOrder = parseInt(req.body.sort_order || 0, 10);
    const heading = (req.body.heading || '').toString().trim();
    const subheading = (req.body.subheading || '').toString().trim();
    const body = (req.body.body ?? '').toString();
    if (!Number.isFinite(id) || !Number.isFinite(sid)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    if (!heading) return res.status(400).json({ ok: false, message: 'Heading required' });
    const result = await queryAsync(
      `UPDATE source_code_report_sections SET sort_order=?, heading=?, subheading=?, body=?, updated_at=NOW() WHERE id=? AND source_code_id=?`,
      [sortOrder, heading, subheading, body, sid, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ ok: false, message: 'Section not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// API: Delete report section
router.delete('/api/:id/sections/:sid', requirePRMOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sid = parseInt(req.params.sid, 10);
    if (!Number.isFinite(id) || !Number.isFinite(sid)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    const result = await queryAsync(
      `DELETE FROM source_code_report_sections WHERE id=? AND source_code_id=?`,
      [sid, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ ok: false, message: 'Section not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// API: Full replace sections (batch save) - heading + multiple subheadings each with body
router.post('/api/:id/sections/batch', requirePRMOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });

    await queryAsync(`DELETE FROM source_code_report_sections WHERE source_code_id = ?`, [id]);

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const heading = (it.heading || '').toString().trim() || '(Untitled)';
      const subheadings = Array.isArray(it.subheadings) ? it.subheadings : [];

      const rawResult = await queryAsync(
        `INSERT INTO source_code_report_sections (source_code_id, sort_order, heading) VALUES (?, ?, ?)`,
        [id, i, heading]
      );
      const insRes = Array.isArray(rawResult) ? rawResult[0] : rawResult;
      const sectionId = insRes?.insertId;

      if (sectionId && subheadings.length > 0) {
        for (let j = 0; j < subheadings.length; j++) {
          const sh = subheadings[j];
          const subheading = (sh.subheading || '').toString().trim() || '(Untitled)';
          const body = (sh.body ?? '').toString();
          await queryAsync(
            `INSERT INTO source_code_report_subheadings (section_id, sort_order, subheading, body) VALUES (?, ?, ?, ?)`,
            [sectionId, j, subheading, body]
          );
        }
      }
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('PRM batch error:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// Download Word: full content library (same composition as “select all” in Project Report Creator)
router.post('/api/:id/download-word', requirePRMOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    const scRows = await queryAsync(`SELECT id, name FROM source_code WHERE id=? LIMIT 1`, [id]);
    if (!scRows.length) return res.status(404).json({ ok: false, message: 'Source code not found' });

    const [sections, subheadings, dbScreenshots, screenshots, diagrams] = await Promise.all([
      queryAsync(
        `SELECT id, sort_order, heading FROM source_code_report_sections WHERE source_code_id=? ORDER BY sort_order ASC, id ASC`,
        [id]
      ),
      queryAsync(
        `SELECT id, section_id, sort_order, subheading, body FROM source_code_report_subheadings WHERE section_id IN (SELECT id FROM source_code_report_sections WHERE source_code_id=?) ORDER BY section_id, sort_order ASC, id ASC`,
        [id]
      ),
      queryAsync(`SELECT id, url, name, data_table FROM source_code_database_screenshots WHERE source_code_id=? ORDER BY id ASC`, [id]),
      queryAsync(`SELECT id, url, type, name FROM screenshots WHERE source_code_id=? ORDER BY id ASC`, [id]),
      queryAsync(`SELECT diagram_type, url FROM source_code_diagrams WHERE source_code_id=?`, [id])
    ]);

    const subBySection = {};
    (subheadings || []).forEach((sh) => {
      if (!subBySection[sh.section_id]) subBySection[sh.section_id] = [];
      subBySection[sh.section_id].push({ id: sh.id, subheading: sh.subheading || '', body: sh.body || '' });
    });
    const dbSectionsWithSub = (sections || []).map((s) => ({
      id: s.id,
      heading: s.heading || '',
      subheadings: subBySection[s.id] || []
    }));

    /** Live editor payload (same shape as batch save) so TOC/bookmarks match unsaved edits. */
    const body = req.body || {};
    const clientItems = Array.isArray(body.items)
      ? body.items
      : Array.isArray(body.sections)
        ? body.sections
        : null;
    const sectionsWithSub =
      clientItems && clientItems.length > 0
        ? clientItems.map((s, idx) => ({
            id: idx,
            heading: (s.heading || '').toString().trim() || '(Untitled)',
            subheadings: (Array.isArray(s.subheadings) ? s.subheadings : []).map((sh) => ({
              subheading: (sh.subheading || '').toString().trim() || '(Untitled)',
              body: (sh.body ?? '').toString()
            }))
          }))
        : dbSectionsWithSub;

    const diagramLabels = {
      er_diagram: 'ER Diagram',
      dfd_zero_level: 'DFD - Zero Level',
      dfd_first_level: 'DFD - First Level',
      dfd_second_level: 'DFD - Second Level',
      use_case_diagram: 'Use Case Diagram',
      class_diagram: 'Class Diagram',
      activity_diagram: 'Activity Diagram',
      sequence_diagram: 'Sequence Diagram',
      flow_chart_diagram: 'Flow Chart Diagram',
      system_architecture_diagram: 'System Architecture Diagram'
    };
    const diagramsList = (diagrams || []).map((d) => ({
      diagram_type: d.diagram_type || '',
      url: d.url || '',
      label: diagramLabels[d.diagram_type] || d.diagram_type || 'Diagram'
    }));

    const items = buildFullReportItems({
      sections: sectionsWithSub,
      dbScreenshots: dbScreenshots || [],
      screenshots: screenshots || [],
      diagrams: diagramsList
    });
    if (!items.length) {
      return res.status(400).json({ ok: false, message: 'No report content for this project yet. Add sections or library assets first.' });
    }

    const sourceCodeName = (scRows[0].name || 'Report').toString().trim();
    const prevBody = req.body;
    try {
      req.body = { sourceCodeId: id, sourceCodeName, items };
      await handleProjectReportWordDownload(req, res);
    } finally {
      req.body = prevBody;
    }
  } catch (e) {
    console.error('PRM download-word error:', e);
    if (!res.headersSent) res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
