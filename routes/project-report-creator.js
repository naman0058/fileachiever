/**
 * Project Report Creator Portal - Create & download customized reports
 * Select topic, sections, db screenshots, screenshots; drag-drop; download Word
 * Admin and project_report_creator can access
 */
const express = require('express');
const path = require('path');
const router = express.Router();
const pool = require('./pool');
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, convertInchesToTwip, ImageRun, Table, TableRow, TableCell, LineRuleType, UnderlineType, WidthType } = require('docx');
const fetch = (typeof globalThis.fetch === 'function') ? globalThis.fetch : require('node-fetch');
const { imageSize: getImageSize } = require('image-size');
const cheerio = require('cheerio');

router.use(express.static(path.join(__dirname, '../public/setup-support'), { maxAge: '1d' }));

const ADMIN_ROLES = new Set(['admin', 'administrator', 'superadmin']);

const BLACK = '000000';
const FONT_OPTS = { font: 'Times New Roman', size: 24, color: BLACK };

/** Parse HTML and return TextRun[] preserving bold, italic, underline. Strips links (a tags). Ensures space between runs. */
function htmlToTextRuns(html) {
  if (!html || !String(html).trim()) return [];
  // Strip anchor tags but keep inner text (avoids blue underlined links in Word)
  let h = String(html).replace(/<a\s[^>]*>/gi, '').replace(/<\/a>/gi, '');
  const rawRuns = [];  // { text, bold, italics, underline }
  const formatStack = [];
  const regex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>|([^<]+)/g;
  let match;
  let text = '';
  let lastChar = '';
  const flush = () => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t) {
      lastChar = t.slice(-1);
      rawRuns.push({
        text: t,
        bold: formatStack.some(f => f === 'b' || f === 'strong'),
        italics: formatStack.some(f => f === 'i' || f === 'em'),
        underline: formatStack.some(f => f === 'u')
      });
    }
    text = '';
  };
  const pushTag = (t) => { if (['b', 'strong', 'i', 'em', 'u'].includes(t)) formatStack.push(t); };
  const popTag = (t) => {
    const idx = formatStack.lastIndexOf(t);
    if (idx >= 0) formatStack.splice(idx, 1);
  };
  const needsSpaceBefore = (raw) => {
    const trimmed = raw.replace(/^\s*/, '');
    if (!trimmed) return false;
    const first = trimmed.charAt(0);
    if (/[.,;:!?)\]'"%]/.test(first)) return false;  // no space before punctuation
    if (/^\s/.test(raw)) return false;  // already has leading space
    const prev = (text.trim() && text.trim().slice(-1)) || lastChar;
    return /[a-zA-Z0-9]/.test(prev) && /[a-zA-Z0-9]/.test(first);
  };
  while ((match = regex.exec(h)) !== null) {
    if (match[1]) {
      const tag = match[1].toLowerCase();
      const isClose = match[0].startsWith('</');
      if (['b', 'strong', 'i', 'em', 'u'].includes(tag)) {
        flush();
        if (isClose) popTag(tag); else pushTag(tag);
      } else if (tag === 'br') {
        text += ' ';
      }
    } else {
      let raw = (match[2] || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      if (needsSpaceBefore(raw)) {
        rawRuns.push({ text: ' ', bold: false, italics: false, underline: false });
        lastChar = ' ';
      }
      text += raw;
    }
  }
  flush();

  // Post-process: insert space between runs (e.g. "System"+"is" -> "System is", "users:"+"customers" -> "users: customers")
  const runs = [];
  for (let i = 0; i < rawRuns.length; i++) {
    const r = rawRuns[i];
    if (i > 0) {
      const prev = rawRuns[i - 1];
      const prevEnd = prev.text.trim().slice(-1);
      const nextStart = r.text.replace(/^\s*/, '').charAt(0);
      const needsSpace = /[a-zA-Z0-9]/.test(nextStart) && !/^\s/.test(r.text) &&
        (/[a-zA-Z0-9]/.test(prevEnd) || prevEnd === ':');
      if (needsSpace) {
        runs.push(new TextRun({ ...FONT_OPTS, text: ' ' }));
      }
    }
    const opts = { ...FONT_OPTS, text: r.text };
    if (r.bold) opts.bold = true;
    if (r.italics) opts.italics = true;
    if (r.underline) opts.underline = { type: UnderlineType.SINGLE };
    runs.push(new TextRun(opts));
  }
  return runs;
}

function getUser(req) {
  if (req.session?.adminid) {
    return { id: req.session.adminid, name: 'Admin', role: 'admin' };
  }
  if (req.user) return req.user;
  if (req.session?.user) return req.session.user;
  return null;
}

function requirePRCOrAdmin(req, res, next) {
  const u = getUser(req);
  if (!u) return res.redirect('/project-report-creator/login');
  const role = String(u.role || '').trim().toLowerCase();
  if (role === 'project_report_creator' || ADMIN_ROLES.has(role)) {
    req._user = u;
    return next();
  }
  return res.redirect('/project-report-creator/login');
}

// Login
router.get('/login', (req, res) => {
  if (getUser(req)) {
    const role = String(getUser(req).role || '').toLowerCase();
    if (role === 'project_report_creator' || ADMIN_ROLES.has(role)) {
      return res.redirect('/project-report-creator');
    }
  }
  res.render('project-report-creator/login', { error: '' });
});

router.post('/login', async (req, res) => {
  try {
    const email = (req.body.email || '').toString().trim();
    const password = (req.body.password || '').toString().trim();
    if (!email || !password) {
      return res.render('project-report-creator/login', { error: 'Email and password required.' });
    }
    const rows = await queryAsync(
      `SELECT id, name, role, is_active FROM crm_users WHERE email=? AND password=? LIMIT 1`,
      [email, password]
    );
    if (!rows.length) {
      return res.render('project-report-creator/login', { error: 'Invalid credentials.' });
    }
    const r = rows[0];
    const role = String(r.role || '').trim().toLowerCase();
    if (role !== 'project_report_creator' && !ADMIN_ROLES.has(role)) {
      return res.render('project-report-creator/login', { error: 'This login is for Project Report Creators or Admin only.' });
    }
    if (!r.is_active) {
      return res.render('project-report-creator/login', { error: 'Account disabled. Contact administrator.' });
    }
    req.session.user = { id: r.id, name: r.name, role: String(r.role || '').trim() };
    return res.redirect('/project-report-creator');
  } catch (e) {
    return res.render('project-report-creator/login', { error: 'Server error.' });
  }
});

router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/project-report-creator/login');
});

// Dashboard - list source codes
router.get('/', requirePRCOrAdmin, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    let where = ['1=1'];
    const params = [];
    if (q) {
      where.push(`(sc.name LIKE ? OR sc.seo_name LIKE ? OR sc.description LIKE ?)`);
      const like = `%${q.replace(/%/g, '\\%')}%`;
      params.push(like, like, like);
    }
    const rows = await queryAsync(`
      SELECT sc.id, sc.name, sc.seo_name, sc.category,
        (SELECT COUNT(*) FROM source_code_report_sections WHERE source_code_id = sc.id) AS section_count,
        (SELECT COUNT(*) FROM source_code_database_screenshots WHERE source_code_id = sc.id) AS db_screenshot_count,
        (SELECT COUNT(*) FROM screenshots WHERE source_code_id = sc.id) AS screenshot_count
      FROM source_code sc
      WHERE ${where.join(' AND ')}
      ORDER BY sc.id DESC
      LIMIT 500
    `, params);
    return res.render('project-report-creator/dashboard', {
      pageTitle: 'Project Report Creator',
      user: req._user,
      rows: rows || [],
      filters: { q }
    });
  } catch (e) {
    console.error('PRC dashboard error:', e);
    res.status(500).send('Failed to load dashboard.');
  }
});

// Report builder - select topic first or go with sourceCodeId
router.get('/create', requirePRCOrAdmin, (req, res) => {
  res.redirect('/project-report-creator');
});

router.get('/create/:id', requirePRCOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.redirect('/project-report-creator?error=Invalid id');
    const scRows = await queryAsync(`SELECT id, name, seo_name, category FROM source_code WHERE id=? LIMIT 1`, [id]);
    if (!scRows.length) return res.redirect('/project-report-creator?error=Source code not found');
    const sc = scRows[0];
    return res.render('project-report-creator/builder', {
      pageTitle: 'Create Report: ' + sc.name,
      user: req._user,
      sc
    });
  } catch (e) {
    console.error('PRC builder error:', e);
    res.redirect('/project-report-creator?error=Failed to load.');
  }
});

// API: Get source code report data (sections, subheadings, db screenshots, screenshots, diagrams)
router.get('/api/source-code/:id/data', requirePRCOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    const [sections, subheadings, dbScreenshots, screenshots, diagrams] = await Promise.all([
      queryAsync(`SELECT id, sort_order, heading FROM source_code_report_sections WHERE source_code_id=? ORDER BY sort_order ASC, id ASC`, [id]),
      queryAsync(`SELECT id, section_id, sort_order, subheading, body FROM source_code_report_subheadings WHERE section_id IN (SELECT id FROM source_code_report_sections WHERE source_code_id=?) ORDER BY section_id, sort_order ASC, id ASC`, [id]),
      queryAsync(`SELECT id, url, name, data_table FROM source_code_database_screenshots WHERE source_code_id=? ORDER BY id ASC`, [id]),
      queryAsync(`SELECT id, url, type, name FROM screenshots WHERE source_code_id=? ORDER BY id ASC`, [id]),
      queryAsync(`SELECT diagram_type, url FROM source_code_diagrams WHERE source_code_id=?`, [id])
    ]);
    const subBySection = {};
    (subheadings || []).forEach(sh => {
      if (!subBySection[sh.section_id]) subBySection[sh.section_id] = [];
      subBySection[sh.section_id].push({ id: sh.id, subheading: sh.subheading || '', body: sh.body || '' });
    });
    const sectionsWithSub = (sections || []).map(s => ({
      id: s.id,
      heading: s.heading || '',
      subheadings: subBySection[s.id] || []
    }));
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
    const diagramsList = (diagrams || []).map(d => ({
      diagram_type: d.diagram_type || '',
      url: d.url || '',
      label: diagramLabels[d.diagram_type] || d.diagram_type || 'Diagram'
    }));
    return res.json({
      ok: true,
      sections: sectionsWithSub,
      dbScreenshots: dbScreenshots || [],
      screenshots: screenshots || [],
      diagrams: diagramsList
    });
  } catch (e) {
    console.error('PRC data API error:', e);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// API: Download Word document
router.post('/api/download-word', requirePRCOrAdmin, async (req, res) => {
  try {
    const sourceCodeId = parseInt(req.body.sourceCodeId, 10);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const sourceCodeName = (req.body.sourceCodeName || 'Report').toString().trim();
    if (!Number.isFinite(sourceCodeId)) return res.status(400).json({ ok: false, message: 'Invalid sourceCodeId' });

    const marginTwip = convertInchesToTwip(1); // 1 inch ≈ 2.54cm
    const children = [];
    const sectionHeadingsAdded = new Set();

    const BLACK = '000000';
    // 1.5 line height: value in 240ths of a line when lineRule is AUTO (360 = 1.5 * 240)
    const LINE_HEIGHT = 360;
    // Spacing after 8 pt = 160 twips (20 twips per point)
    const SPACING_AFTER = 160;
    const paraSpacing = { spacing: { line: LINE_HEIGHT, lineRule: LineRuleType.AUTO, after: SPACING_AFTER } };

    const addHeading = (text, sizePt = 16, centered = true, opts = {}) => {
      const isMainHeading = sizePt >= 16 && centered;
      const prefix = opts.prefix || '';
      const raw = (text || ' ').trim();
      // Main headings: "Chapter 1: Introduction" (title case). Subheadings: "1.1 Overview" (as-is)
      const displayText = isMainHeading
        ? raw.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        : raw;
      const finalText = (prefix + displayText) || ' ';
      const pageBreak = opts.pageBreakBefore !== undefined
        ? opts.pageBreakBefore
        : (isMainHeading && children.length > 0);
      children.push(new Paragraph({
        children: [new TextRun({ text: finalText || ' ', font: 'Times New Roman', size: sizePt * 2, color: BLACK, bold: true })],
        heading: sizePt >= 16 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
        alignment: centered ? AlignmentType.CENTER : AlignmentType.LEFT,
        pageBreakBefore: pageBreak,
        ...paraSpacing
      }));
    };

    const addBody = (html) => {
      if (!html || !String(html).trim()) return;
      try {
        const safeHtml = String(html)
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        const $ = cheerio.load(safeHtml, { decodeEntities: false });
        // Walk p, ul, ol in document order to preserve paragraphs and bullet lists
        const blocks = $('p, ul, ol');
        if (blocks.length > 0) {
          blocks.each((_, el) => {
            const tag = (el.tagName || '').toLowerCase();
            const $el = $(el);
            if (tag === 'p') {
              const inner = $el.html() || '';
              const runs = htmlToTextRuns(inner);
              if (runs.length > 0) {
                children.push(new Paragraph({
                  children: runs,
                  alignment: AlignmentType.JUSTIFIED,
                  ...paraSpacing
                }));
              }
            } else if (tag === 'ul' || tag === 'ol') {
              $el.find('> li').each((_, liEl) => {
                const liHtml = $(liEl).html() || '';
                const runs = htmlToTextRuns(liHtml);
                if (runs.length > 0) {
                  children.push(new Paragraph({
                    children: runs,
                    bullet: { level: 0 },
                    alignment: AlignmentType.LEFT,
                    ...paraSpacing
                  }));
                }
              });
            }
          });
        } else {
          const runs = htmlToTextRuns(html);
          if (runs.length > 0) {
            children.push(new Paragraph({
              children: runs,
              alignment: AlignmentType.JUSTIFIED,
              ...paraSpacing
            }));
          }
        }
      } catch (err) {
        const text = (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text) {
          children.push(new Paragraph({
            children: [new TextRun({ text, ...FONT_OPTS })],
            alignment: AlignmentType.JUSTIFIED,
            ...paraSpacing
          }));
        }
      }
    };

    // Page content area: ~6.5" width, ~8" height (1" margins). docx ~96 DPI: full width, fit within page
    const PAGE_CONTENT_WIDTH = 600;
    const PAGE_CONTENT_HEIGHT = 550;
    const addImage = async (url, opts = {}) => {
      try {
        const fullUrl = url.startsWith('http') ? url : (req.protocol + '://' + req.get('host') + (url.startsWith('/') ? '' : '/') + url);
        const resp = await fetch(fullUrl);
        if (!resp.ok) return;
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.length > 0 && buf.length < 5 * 1024 * 1024) { // max 5MB
          const ext = (url.split('.').pop() || 'jpg').toLowerCase().replace(/\?.*$/, '');
          const type = ['png','jpg','jpeg','gif','bmp'].includes(ext) ? (ext === 'jpg' ? 'jpeg' : ext) : 'jpeg';
          const maxW = opts.maxWidth ?? PAGE_CONTENT_WIDTH;
          const maxH = opts.maxHeight ?? PAGE_CONTENT_HEIGHT;
          let width = maxW, height = maxH;
          try {
            const dims = getImageSize(buf);
            if (dims && dims.width && dims.height) {
              // Scale to fit within page: 100% of available width, no crop, maintain aspect ratio
              const scaleW = maxW / dims.width;
              const scaleH = maxH / dims.height;
              const scale = Math.min(scaleW, scaleH, 1);  // never upscale
              width = Math.round(dims.width * scale);
              height = Math.round(dims.height * scale);
              if (width < 50) width = 50;
              if (height < 50) height = 50;
            }
          } catch (_) { /* use defaults */ }
          children.push(new Paragraph({
            children: [
              new ImageRun({
                type: type,
                data: buf,
                transformation: { width, height }
              })
            ],
            alignment: AlignmentType.CENTER,
            ...paraSpacing
          }));
        }
      } catch (err) {
        console.warn('Image fetch failed:', url, err.message);
      }
    };

    /** Main section headings: Data Dictionary, Data Table, ScreenShots - 16pt, center, new page, uppercase. Only once per section. */
    const addSectionHeading = (text) => {
      if (!text || sectionHeadingsAdded.has(text)) return;
      sectionHeadingsAdded.add(text);
      children.push(new Paragraph({
        children: [new TextRun({ text: text.toUpperCase(), font: 'Times New Roman', size: 32, color: BLACK, bold: true })],
        alignment: AlignmentType.CENTER,
        pageBreakBefore: true,
        ...paraSpacing
      }));
    };

    const addCaption = (text, bold = true) => {
      if (!text) return;
      children.push(new Paragraph({
        children: [new TextRun({ text, font: 'Times New Roman', size: 24, color: BLACK, bold })],
        alignment: AlignmentType.LEFT,
        ...paraSpacing
      }));
    };

    const addDatatable = (html) => {
      if (!html || !html.trim()) return;
      try {
        const safeHtml = String(html)
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        const $ = cheerio.load(safeHtml, { decodeEntities: false });
        const tables = $('table');
        if (tables.length > 0) {
          tables.each((_, tableEl) => {
            const rows = [];
            $(tableEl).find('tr').each((_, trEl) => {
              const cells = [];
              $(trEl).find('td, th').each((_, cellEl) => {
                const cellHtml = $(cellEl).html() || '';
                const runs = htmlToTextRuns(cellHtml);
                const cellChildren = runs.length > 0 ? runs : [new TextRun({ ...FONT_OPTS, text: ' ' })];
                cells.push(new TableCell({
                  children: [new Paragraph({
                    children: cellChildren,
                    ...paraSpacing
                  })]
                }));
              });
              if (cells.length > 0) {
                rows.push(new TableRow({ children: cells }));
              }
            });
            if (rows.length > 0) {
              children.push(new Table({
                rows,
                width: { size: 100, type: WidthType.PERCENTAGE }
              }));
            }
          });
        } else {
          const runs = htmlToTextRuns(html);
          if (runs.length > 0) {
            children.push(new Paragraph({
              children: runs,
              alignment: AlignmentType.JUSTIFIED,
              ...paraSpacing
            }));
          }
        }
      } catch (err) {
        const text = (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text) {
          children.push(new Paragraph({
            children: [new TextRun({ text, ...FONT_OPTS })],
            alignment: AlignmentType.JUSTIFIED,
            ...paraSpacing
          }));
        }
      }
    };

    // Build index entries: S.No., Chapter (Including Subchapter), Page No.
    // Format: Main "Chapter 1 INTRODUCTION", Sub "1.1 Purpose of the Project"
    const indexRows = [];
    let secNum = 0;
    let subCount = 0;
    let pageNum = 1;
    for (const it of items) {
      if (it.type === 'heading' && it.heading) {
        secNum++;
        subCount = 0;
        const chTitle = (it.heading || '').trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        indexRows.push({ sNo: String(secNum), chapter: `Chapter ${secNum}: ${chTitle}`, page: String(pageNum) });
        pageNum++;
      } else if (it.type === 'subheading' && it.subheading) {
        subCount++;
        const sNo = secNum + '.' + subCount;
        indexRows.push({ sNo, chapter: `${sNo} ${(it.subheading || '').trim()}`, page: String(pageNum) });
        pageNum++;
      }
    }

    if (indexRows.length > 0) {
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Table of Contents', font: 'Times New Roman', size: 32, color: BLACK })],
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        pageBreakBefore: false,
        ...paraSpacing
      }));
      const tocRows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'S.No.', font: 'Times New Roman', size: 24, color: BLACK, bold: true })], ...paraSpacing })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Chapter (Including Subchapter)', font: 'Times New Roman', size: 24, color: BLACK, bold: true })], ...paraSpacing })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Page No.', font: 'Times New Roman', size: 24, color: BLACK, bold: true })], ...paraSpacing })] })
          ]
        }),
        ...indexRows.map(r => new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r.sNo, font: 'Times New Roman', size: 24, color: BLACK })], ...paraSpacing })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r.chapter, font: 'Times New Roman', size: 24, color: BLACK })], ...paraSpacing })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r.page, font: 'Times New Roman', size: 24, color: BLACK })], ...paraSpacing })] })
          ]
        }))
      ];
      children.push(new Table({ rows: tocRows }));
      children.push(new Paragraph({
        children: [new TextRun({ text: ' ', font: 'Times New Roman', size: 24 })],
        pageBreakBefore: true,
        ...paraSpacing
      }));
    }

    let nextSubheadingIsFirst = true;
    let chapterNum = 0;
    let subNum = 0;
    for (const it of items) {
      const type = (it.type || '').toString();
      if (type === 'heading') {
        chapterNum++;
        subNum = 0;
        nextSubheadingIsFirst = true;
        addHeading(it.heading || '', 16, true, { prefix: `Chapter ${chapterNum}: ` });  // Main: "Chapter 1: Introduction"
      } else if (type === 'subheading') {
        subNum++;
        addHeading(it.subheading || '', 14, false, {
          pageBreakBefore: !nextSubheadingIsFirst,
          prefix: `${chapterNum}.${subNum} `
        });  // Sub: "1.1 Purpose of the Project"
        nextSubheadingIsFirst = false;
        if (it.body) addBody(it.body);
      } else if (type === 'body') {
        addBody(it.body);
      } else if (type === 'db_screenshot') {
        addSectionHeading('Data Table');
        addCaption(it.name || 'Database Screenshot', false);  // Name along with their table
        if (it.url) await addImage(it.url);  // full width, fit within page
      } else if (type === 'db_datatable') {
        addSectionHeading('Data Dictionary');
        addCaption(it.name || 'Datatable', false);  // Name along with their directory
        if (it.data_table) addDatatable(it.data_table);
      } else if (type === 'screenshot') {
        addSectionHeading('ScreenShots');
        addCaption(it.name || 'Screenshot', false);  // Name along with their screenshot
        if (it.url) await addImage(it.url);  // full width, fit within page
      } else if (type === 'diagram') {
        children.push(new Paragraph({ children: [new TextRun({ text: ' ' })], pageBreakBefore: true }));
        addCaption(it.label || it.diagram_type || 'Diagram');
        if (it.url) await addImage(it.url);  // full width, fit within page
      }
    }

    const doc = new Document({
      styles: {
        default: {
          document: {
            paragraph: {
              spacing: { line: LINE_HEIGHT, lineRule: LineRuleType.AUTO }
            }
          }
        }
      },
      sections: [{
        properties: {
          page: {
            margin: {
              top: marginTwip,
              right: marginTwip,
              bottom: marginTwip,
              left: marginTwip
            }
          }
        },
        children: children.length ? children : [
          new Paragraph({ children: [new TextRun({ text: 'No content selected.', font: 'Times New Roman', size: 24, color: '000000' })], ...paraSpacing })
        ]
      }]
    });

    const buf = await Packer.toBuffer(doc);
    const filename = (sourceCodeName.replace(/[^\w\s-]/g, '') || 'report') + '.docx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.send(buf);
  } catch (e) {
    console.error('PRC Word download error:', e);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
