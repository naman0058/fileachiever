/**
 * Source Code Manager Portal - Dedicated login and panel for source code managers
 * Tasks: Add screenshot if missing, add demo_link if missing
 * Admin can verify completed work
 */
const express = require('express');
const path = require('path');
const router = express.Router();
const pool = require('./pool');
const upload = require('./multer');

router.use(express.static(path.join(__dirname, '../public/setup-support'), { maxAge: '1d' }));
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);

const ADMIN_ROLES = new Set(['admin', 'administrator', 'superadmin']);

const DIAGRAM_TYPES = [
  { key: 'er_diagram', label: 'ER Diagram' },
  { key: 'dfd_zero_level', label: 'DFD - Zero Level' },
  { key: 'dfd_first_level', label: 'DFD - First Level' },
  { key: 'dfd_second_level', label: 'DFD - Second Level' },
  { key: 'use_case_diagram', label: 'Use Case Diagram' },
  { key: 'class_diagram', label: 'Class Diagram' },
  { key: 'activity_diagram', label: 'Activity Diagram' },
  { key: 'sequence_diagram', label: 'Sequence Diagram' },
  { key: 'flow_chart_diagram', label: 'Flow Chart Diagram' },
  { key: 'system_architecture_diagram', label: 'System Architecture Diagram' }
];
const DIAGRAM_TYPE_KEYS = new Set(DIAGRAM_TYPES.map(d => d.key));

function getUser(req) {
  if (req.session?.adminid) {
    return { id: req.session.adminid, name: 'Admin', role: 'admin' };
  }
  if (req.user) return req.user;
  if (req.session?.user) return req.session.user;
  return null;
}

function requireSourceCodeManagerLogin(req, res, next) {
  const u = getUser(req);
  if (!u) return res.redirect('/source-code-manager/login');
  const role = String(u.role || '').trim().toLowerCase();
  if (role !== 'source_code_manager') return res.redirect('/source-code-manager/login');
  req._user = u;
  next();
}

/** Allows source_code_manager OR admin (for sales admin to edit screenshots/demo) */
function requireSourceCodeManagerOrAdmin(req, res, next) {
  const u = getUser(req);
  if (!u) return res.redirect('/source-code-manager/login');
  const role = String(u.role || '').trim().toLowerCase();
  if (role === 'source_code_manager' || ADMIN_ROLES.has(role)) {
    req._user = u;
    return next();
  }
  return res.redirect('/source-code-manager/login');
}

// Login
router.get('/login', (req, res) => {
  if (getUser(req) && String(getUser(req).role || '').toLowerCase() === 'source_code_manager') {
    return res.redirect('/source-code-manager');
  }
  res.render('source-code-manager/login', { error: '' });
});

router.post('/login', async (req, res) => {
  try {
    const email = (req.body.email || '').toString().trim();
    const password = (req.body.password || '').toString().trim();
    if (!email || !password) {
      return res.render('source-code-manager/login', { error: 'Email and password required.' });
    }
    const rows = await queryAsync(
      `SELECT id, name, role, is_active FROM crm_users WHERE email=? AND password=? LIMIT 1`,
      [email, password]
    );
    if (!rows.length) {
      return res.render('source-code-manager/login', { error: 'Invalid credentials.' });
    }
    const r = rows[0];
    if (String(r.role || '').trim().toLowerCase() !== 'source_code_manager') {
      return res.render('source-code-manager/login', { error: 'This login is for Source Code Managers only.' });
    }
    if (!r.is_active) {
      return res.render('source-code-manager/login', { error: 'Account disabled. Contact administrator.' });
    }
    req.session.user = { id: r.id, name: r.name, role: String(r.role || '').trim() };
    return res.redirect('/source-code-manager');
  } catch (e) {
    return res.render('source-code-manager/login', { error: 'Server error.' });
  }
});

router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/source-code-manager/login');
});

// Dashboard - list all source_code with has_screenshot, has_demo, actions
router.get('/', requireSourceCodeManagerOrAdmin, async (req, res) => {
  try {
    const tab = (req.query.tab || 'all').toString();
    const q = (req.query.q || '').toString().trim();
    let where = ['1=1'];
    const params = [];

    if (tab === 'pending') {
      where.push(`(sc.image IS NULL OR sc.image = '' OR sc.demo_url IS NULL OR sc.demo_url = '')`);
    } else if (tab === 'complete') {
      where.push(`sc.image IS NOT NULL AND sc.image != '' AND sc.demo_url IS NOT NULL AND sc.demo_url != ''`);
    }

    if (q) {
      where.push(`(sc.name LIKE ? OR sc.seo_name LIKE ? OR sc.description LIKE ?)`);
      const like = `%${q.replace(/%/g, '\\%')}%`;
      params.push(like, like, like);
    }

    const rows = await queryAsync(`
      SELECT sc.id, sc.name, sc.seo_name, sc.category, sc.image, sc.demo_url,
        sc.scm_screenshot_verified, sc.scm_demo_verified,
        (SELECT COUNT(*) FROM screenshots WHERE source_code_id = sc.id) AS screenshot_count,
        (SELECT COUNT(*) FROM source_code_diagrams WHERE source_code_id = sc.id) AS diagram_count,
        (SELECT COUNT(*) FROM source_code_database_screenshots WHERE source_code_id = sc.id) AS db_screenshot_count,
        (SELECT COUNT(*) FROM source_code_database_screenshots WHERE source_code_id = sc.id AND data_table IS NOT NULL AND data_table != '') AS db_with_datatable_count
      FROM source_code sc
      WHERE ${where.join(' AND ')}
      ORDER BY sc.id DESC
      LIMIT 500
    `, params);

    const TOTAL_DIAGRAMS = 10;
    // Compute has_screenshot, has_demo, diagrams status for each row
    const enriched = rows.map(r => {
      const hasImage = !!(r.image && String(r.image).trim());
      const hasScreenshots = (r.screenshot_count || 0) > 0;
      const hasScreenshot = hasImage || hasScreenshots;
      const hasDemo = !!(r.demo_url && String(r.demo_url).trim());
      const diagramCount = parseInt(r.diagram_count || 0, 10);
      const hasAllDiagrams = diagramCount >= TOTAL_DIAGRAMS;
      const dbScreenshotCount = parseInt(r.db_screenshot_count || 0, 10);
      const dbWithDatatableCount = parseInt(r.db_with_datatable_count || 0, 10);
      const hasDbScreenshots = dbScreenshotCount > 0;
      const hasAllDatatables = dbScreenshotCount > 0 && dbWithDatatableCount >= dbScreenshotCount;
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
        needsScreenshot: !hasScreenshot,
        needsDemo: !hasDemo,
        needsDiagrams: diagramCount < TOTAL_DIAGRAMS,
        needsDbScreenshots: !hasDbScreenshots
      };
    });

    const [pendingResult, completeResult, totalResult] = await Promise.all([
      queryAsync(`SELECT COUNT(*) AS c FROM source_code WHERE (image IS NULL OR image = '' OR demo_url IS NULL OR demo_url = '')`),
      queryAsync(`SELECT COUNT(*) AS c FROM source_code WHERE image IS NOT NULL AND image != '' AND demo_url IS NOT NULL AND demo_url != ''`),
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

    return res.render('source-code-manager/dashboard', {
      pageTitle: 'Source Code Manager',
      active: tab,
      user: req._user,
      rows: enriched,
      stats,
      filters,
      buildQuery
    });
  } catch (e) {
    console.error('Source code manager dashboard error:', e);
    res.status(500).send('Failed to load dashboard.');
  }
});

// Edit form - add screenshot or demo (admin can also access)
router.get('/edit/:id', requireSourceCodeManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.redirect('/source-code-manager?error=Invalid id');
    const rows = await queryAsync(`
      SELECT sc.*, (SELECT COUNT(*) FROM screenshots WHERE source_code_id = sc.id) AS screenshot_count
      FROM source_code sc WHERE sc.id = ? LIMIT 1
    `, [id]);
    if (!rows.length) return res.redirect('/source-code-manager?error=Not found');
    const sc = rows[0];
    if (!sc.description && sc.short_description) sc.description = sc.short_description;
    const hasImage = !!(sc.image && String(sc.image).trim());
    const hasScreenshots = (sc.screenshot_count || 0) > 0;
    const [screenshots, diagrams, dbScreenshots] = await Promise.all([
      queryAsync(`SELECT id, url, type, name FROM screenshots WHERE source_code_id = ? ORDER BY id`, [id]),
      queryAsync(`SELECT diagram_type, url FROM source_code_diagrams WHERE source_code_id = ?`, [id]),
      queryAsync(`SELECT id, url, name, data_table FROM source_code_database_screenshots WHERE source_code_id = ? ORDER BY id`, [id])
    ]);
    const diagramsMap = {};
    (diagrams || []).forEach(d => { diagramsMap[d.diagram_type] = d.url; });
    return res.render('source-code-manager/edit', {
      pageTitle: 'Edit Source Code',
      user: req._user,
      sc,
      hasScreenshot: hasImage || hasScreenshots,
      hasDemo: !!(sc.demo_url && String(sc.demo_url).trim()),
      screenshots: screenshots || [],
      diagramsMap: diagramsMap || {},
      diagramTypes: DIAGRAM_TYPES,
      dbScreenshots: dbScreenshots || [],
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (e) {
    console.error('Edit source code error:', e);
    res.redirect('/source-code-manager?error=Failed to load.');
  }
});

// Update image (main screenshot)
router.post('/api/:id/image', requireSourceCodeManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const url = (req.body.url || req.body.image || '').toString().trim();
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    if (!url) return res.status(400).json({ ok: false, message: 'Image URL required' });
    await queryAsync(`UPDATE source_code SET image = ? WHERE id = ?`, [url, id]);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// Update demo_url
router.post('/api/:id/demo', requireSourceCodeManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const url = (req.body.url || req.body.demo_url || '').toString().trim();
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    if (!url) return res.status(400).json({ ok: false, message: 'Demo URL required' });
    await queryAsync(`UPDATE source_code SET demo_url = ? WHERE id = ?`, [url, id]);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// Add screenshot - url, type (input_design | output_design), name
router.post('/api/:id/screenshots', requireSourceCodeManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const url = (req.body.url || '').toString().trim();
    const typeVal = (req.body.type || 'input_design').toString();
    const type = ['input_design', 'output_design'].includes(typeVal) ? typeVal : 'input_design';
    const name = (req.body.name || '').toString().trim();
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    if (!url) return res.status(400).json({ ok: false, message: 'Screenshot URL required' });
    await queryAsync(`INSERT INTO screenshots (source_code_id, url, type, name) VALUES (?, ?, ?, ?)`, [id, url, type, name]);
    return res.json({ ok: true, added: 1 });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// Update single screenshot - url, type, name
router.put('/api/:id/screenshots/:sid', requireSourceCodeManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sid = parseInt(req.params.sid, 10);
    const url = (req.body.url || '').toString().trim();
    const typeVal = (req.body.type || 'input_design').toString();
    const type = ['input_design', 'output_design'].includes(typeVal) ? typeVal : 'input_design';
    const name = (req.body.name || '').toString().trim();
    if (!Number.isFinite(id) || !Number.isFinite(sid)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    if (!url) return res.status(400).json({ ok: false, message: 'Screenshot URL required' });
    const result = await queryAsync(
      `UPDATE screenshots SET url = ?, type = ?, name = ? WHERE id = ? AND source_code_id = ?`,
      [url, type, name, sid, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ ok: false, message: 'Screenshot not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// Delete screenshot
router.delete('/api/:id/screenshots/:sid', requireSourceCodeManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sid = parseInt(req.params.sid, 10);
    if (!Number.isFinite(id) || !Number.isFinite(sid)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    const result = await queryAsync(
      `DELETE FROM screenshots WHERE id = ? AND source_code_id = ?`,
      [sid, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ ok: false, message: 'Screenshot not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// ---------- Diagram APIs (ER, DFD, Use Case, Class, Activity, Sequence, Flow Chart, System Architecture) ----------
router.post('/api/:id/diagrams', requireSourceCodeManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const diagramType = (req.body.diagram_type || '').toString();
    const url = (req.body.url || '').toString().trim();
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    if (!DIAGRAM_TYPE_KEYS.has(diagramType)) return res.status(400).json({ ok: false, message: 'Invalid diagram type' });
    if (!url) return res.status(400).json({ ok: false, message: 'Diagram URL required' });
    await queryAsync(
      `INSERT INTO source_code_diagrams (source_code_id, diagram_type, url) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE url = VALUES(url), updated_at = NOW()`,
      [id, diagramType, url]
    );
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

router.put('/api/:id/diagrams/:type', requireSourceCodeManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const diagramType = (req.params.type || '').toString().replace(/-/g, '_');
    const url = (req.body.url || '').toString().trim();
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    if (!DIAGRAM_TYPE_KEYS.has(diagramType)) return res.status(400).json({ ok: false, message: 'Invalid diagram type' });
    if (!url) return res.status(400).json({ ok: false, message: 'Diagram URL required' });
    const result = await queryAsync(
      `UPDATE source_code_diagrams SET url = ?, updated_at = NOW() WHERE source_code_id = ? AND diagram_type = ?`,
      [url, id, diagramType]
    );
    if (result.affectedRows === 0) return res.status(404).json({ ok: false, message: 'Diagram not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

router.delete('/api/:id/diagrams/:type', requireSourceCodeManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const diagramType = (req.params.type || '').toString().replace(/-/g, '_');
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    if (!DIAGRAM_TYPE_KEYS.has(diagramType)) return res.status(400).json({ ok: false, message: 'Invalid diagram type' });
    const result = await queryAsync(
      `DELETE FROM source_code_diagrams WHERE source_code_id = ? AND diagram_type = ?`,
      [id, diagramType]
    );
    if (result.affectedRows === 0) return res.status(404).json({ ok: false, message: 'Diagram not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// ---------- Database Screenshots APIs (multiple per source code, each with name + data_table) ----------
// Accept both JSON and form-urlencoded for compatibility
router.post('/api/:id/database-screenshots', requireSourceCodeManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const url = (req.body.url || '').toString().trim();
    const name = (req.body.name || '').toString().trim();
    const dataTable = (req.body.data_table ?? req.body.dataTable ?? '').toString();
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    if (!url) return res.status(400).json({ ok: false, message: 'URL required' });
    if (!name) return res.status(400).json({ ok: false, message: 'Name required' });
    await queryAsync(
      `INSERT INTO source_code_database_screenshots (source_code_id, url, name, data_table) VALUES (?, ?, ?, ?)`,
      [id, url, name, dataTable]
    );
    return res.json({ ok: true, added: 1 });
  } catch (e) {
    console.error('DB screenshot add error:', e);
    return res.status(500).json({ ok: false, message: e.message || 'Server error' });
  }
});

router.put('/api/:id/database-screenshots/:dsid', requireSourceCodeManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const dsid = parseInt(req.params.dsid, 10);
    const url = (req.body.url || '').toString().trim();
    const name = (req.body.name || '').toString().trim();
    const dataTable = (req.body.data_table ?? req.body.dataTable ?? '').toString();
    if (!Number.isFinite(id) || !Number.isFinite(dsid)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    if (!url) return res.status(400).json({ ok: false, message: 'URL required' });
    if (!name) return res.status(400).json({ ok: false, message: 'Name required' });
    const result = await queryAsync(
      `UPDATE source_code_database_screenshots SET url = ?, name = ?, data_table = ?, updated_at = NOW() WHERE id = ? AND source_code_id = ?`,
      [url, name, dataTable, dsid, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ ok: false, message: 'Database screenshot not found' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('DB screenshot update error:', e);
    return res.status(500).json({ ok: false, message: e.message || 'Server error' });
  }
});

router.delete('/api/:id/database-screenshots/:dsid', requireSourceCodeManagerOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const dsid = parseInt(req.params.dsid, 10);
    if (!Number.isFinite(id) || !Number.isFinite(dsid)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    const result = await queryAsync(
      `DELETE FROM source_code_database_screenshots WHERE id = ? AND source_code_id = ?`,
      [dsid, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ ok: false, message: 'Database screenshot not found' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
