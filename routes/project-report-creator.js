/**
 * Project Report Creator Portal - Create & download customized reports
 * Select topic, sections, db screenshots, screenshots; drag-drop; download Word
 * Admin and project_report_creator can access
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const pool = require('./pool');
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);
const { buildSessionUser, enforceCrmSession } = require('../utils/crmSession');
const { Document, Packer, Paragraph, TextRun, Run, HeadingLevel, AlignmentType, convertInchesToTwip, ImageRun, Table, TableRow, TableCell, LineRuleType, UnderlineType, WidthType, TableLayoutType, Bookmark, Footer, PageNumber, BuilderElement, XmlComponent, NextAttributeComponent, SpaceType } = require('docx');

/** OOXML w:instrText for PAGEREF (complex field so rPr size/bold apply to the result in Word). */
class InstrTextPageref extends XmlComponent {
  constructor(bookmarkId) {
    super('w:instrText');
    this.root.push(new NextAttributeComponent({
      space: { key: 'xml:space', value: SpaceType.PRESERVE }
    }));
    this.root.push(`PAGEREF ${bookmarkId} \\h`);
  }
}

function tocFldChar(fldCharType, dirty = true) {
  return new BuilderElement({
    name: 'w:fldChar',
    attributes: {
      type: { key: 'w:fldCharType', value: fldCharType },
      dirty: { key: 'w:dirty', value: dirty }
    }
  });
}

/** One PAGEREF complex field inside a single w:r with explicit formatting (12 pt, bold for main TOC rows). */
function tocPagerefRun(bookmarkId, runOpts) {
  return new Run({
    font: runOpts.font,
    size: runOpts.size,
    bold: runOpts.bold,
    color: runOpts.color,
    children: [
      tocFldChar('begin'),
      new InstrTextPageref(bookmarkId),
      tocFldChar('separate'),
      tocFldChar('end')
    ]
  });
}
const fetch = (typeof globalThis.fetch === 'function') ? globalThis.fetch : require('node-fetch');
const { imageSize: getImageSize } = require('image-size');
const cheerio = require('cheerio');
const { buildFullReportItems, filterSynopsisItems, filterPredefinedReportItems } = require('./prc-build-full-report-items');
const { buildReportItemsFromPastedToc, parsePastedTocToEntries } = require('./prc-toc-paste-match');
const {
  estimateBodyTocPages,
  measureBodyTocPages,
  formatTocPageLabel,
  buildReportPdfBuffer,
  bufferCacheToDataUrlMap,
  getSharedBrowser
} = require('./prc-report-export');

/** Run async work over items with a fixed concurrency limit. */
async function mapPool(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length);
  let next = 0;
  const run = async () => {
    while (true) {
      const i = next++;
      if (i >= list.length) return;
      results[i] = await worker(list[i], i);
    }
  };
  const n = Math.max(1, Math.min(concurrency || 1, list.length || 1));
  await Promise.all(Array.from({ length: n }, () => run()));
  return results;
}

function resolveReportImageUrl(url, req) {
  const u = (url || '').toString().trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return (req.protocol || 'http') + '://' + (req.get('host') || 'localhost') + (u.startsWith('/') ? '' : '/') + u;
}

/** Prefer disk read for same-host / public assets (avoids round-trip HTTP). */
function tryReadLocalReportImage(url, req) {
  try {
    let pathname = (url || '').toString().trim();
    if (!pathname) return null;
    if (/^https?:\/\//i.test(pathname)) {
      const parsed = new URL(pathname);
      const reqHost = String(req.get('host') || '').split(':')[0].toLowerCase();
      const urlHost = String(parsed.hostname || '').toLowerCase();
      const localHosts = new Set(['localhost', '127.0.0.1', reqHost].filter(Boolean));
      if (!localHosts.has(urlHost)) return null;
      pathname = parsed.pathname || '';
    }
    if (!pathname.startsWith('/')) return null;
    const rel = pathname.replace(/^\//, '').replace(/\?.*$/, '');
    const candidates = [
      path.join(__dirname, '../public', rel),
      path.join(__dirname, '..', rel)
    ];
    for (const local of candidates) {
      if (fs.existsSync(local) && fs.statSync(local).isFile()) {
        const buf = fs.readFileSync(local);
        if (buf.length > 0 && buf.length < 5 * 1024 * 1024) return buf;
      }
    }
  } catch (_) { /* ignore */ }
  return null;
}

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

async function requirePRCOrAdmin(req, res, next) {
  if (req.session?.adminid) {
    req._user = { id: req.session.adminid, name: 'Admin', role: 'admin' };
    return next();
  }
  const result = await enforceCrmSession(req, res, '/project-report-creator/login');
  if (!result) return;
  const role = String(result.role || '').trim().toLowerCase();
  // report_sales may open /create/:id from Report Sales Team portal to deliver customized/originality
  if (
    role === 'project_report_creator' ||
    role === 'report_sales' ||
    role === 'report_sales_admin' ||
    ADMIN_ROLES.has(role)
  ) {
    req._user = result;
    return next();
  }
  return res.redirect('/project-report-creator/login');
}

const PRC_DIAGRAM_LABELS = {
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

/** Sections + library assets for one source code (report creator / Word export). */
async function loadPrcLibraryForExport(sourceCodeId) {
  const id = sourceCodeId;
  const [sections, subheadings, dbScreenshots, screenshots, diagrams] = await Promise.all([
    queryAsync(`SELECT id, sort_order, heading FROM source_code_report_sections WHERE source_code_id=? ORDER BY sort_order ASC, id ASC`, [id]),
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
  const sectionsWithSub = (sections || []).map((s) => ({
    id: s.id,
    heading: s.heading || '',
    subheadings: subBySection[s.id] || []
  }));
  const diagramsList = (diagrams || []).map((d) => ({
    diagram_type: d.diagram_type || '',
    url: d.url || '',
    label: PRC_DIAGRAM_LABELS[d.diagram_type] || d.diagram_type || 'Diagram'
  }));
  return {
    sectionsWithSub,
    dbScreenshots: dbScreenshots || [],
    screenshots: screenshots || [],
    diagramsList
  };
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
      `SELECT id, name, role, is_active, session_token FROM crm_users WHERE email=? AND password=? LIMIT 1`,
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
    req.session.user = buildSessionUser(r);
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
    const { sectionsWithSub, dbScreenshots, screenshots, diagramsList } = await loadPrcLibraryForExport(id);
    return res.json({
      ok: true,
      sections: sectionsWithSub,
      dbScreenshots,
      screenshots,
      diagrams: diagramsList
    });
  } catch (e) {
    console.error('PRC data API error:', e);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// API: Paste TOC text → match library (exact/related + diagram/DB/screenshot rules) → reportItems
router.post('/api/source-code/:id/toc-from-text', requirePRCOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });

    const text = (req.body && req.body.text != null ? req.body.text : '').toString();
    if (!text.trim()) {
      return res.status(400).json({ ok: false, message: 'Paste your table of contents text first.' });
    }

    const scRows = await queryAsync(`SELECT id, name FROM source_code WHERE id=? LIMIT 1`, [id]);
    if (!scRows.length) return res.status(404).json({ ok: false, message: 'Source code not found' });

    const tocEntries = parsePastedTocToEntries(text);
    if (!tocEntries.length) {
      return res.status(422).json({
        ok: false,
        message:
          'No TOC lines detected. Paste lines such as "1 Introduction", "1.1 Background", or plain titles like "System Architecture".'
      });
    }

    const lib = await loadPrcLibraryForExport(id);
    const { reportItems, matchedLabels, missingLabels, notes } = buildReportItemsFromPastedToc({
      tocEntries,
      sections: lib.sectionsWithSub,
      diagrams: lib.diagramsList,
      screenshots: lib.screenshots,
      dbScreenshots: lib.dbScreenshots
    });

    return res.json({
      ok: true,
      tocEntries,
      reportItems,
      notes: (notes || []).join(' '),
      matchedLabels,
      missingLabels
    });
  } catch (e) {
    console.error('PRC toc-from-text error:', e);
    return res.status(500).json({ ok: false, message: (e && e.message) || 'Server error' });
  }
});

// API: Download Word document
async function handleProjectReportWordDownload(req, res) {
  try {
    const sourceCodeId = parseInt(req.body.sourceCodeId, 10);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const sourceCodeName = (req.body.sourceCodeName || 'Report').toString().trim();
    if (!Number.isFinite(sourceCodeId)) return res.status(400).json({ ok: false, message: 'Invalid sourceCodeId' });

    const formatRaw = String(
      (req.body && req.body.format) || (req.query && req.query.format) || 'docx'
    )
      .toLowerCase()
      .trim();
    const wantPdf = formatRaw === 'pdf';
    const baseName = sourceCodeName.replace(/[^\w\s-]/g, '') || 'report';

    if (wantPdf) {
      const baseUrl =
        (req.protocol || 'http') + '://' + (req.get('host') || 'localhost:5000');
      const pdfBuf = await buildReportPdfBuffer({
        title: sourceCodeName,
        items,
        baseUrl
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="' + baseName + '.pdf"');
      return res.send(pdfBuf);
    }

    const marginTwip = convertInchesToTwip(1); // 1 inch ≈ 2.54cm
    const parts = [];

    const BLACK = '000000';
    /** Table of contents body: 12 pt (docx size = half-points) */
    const TOC_FS = 24;
    // 1.5 line height: value in 240ths of a line when lineRule is AUTO (360 = 1.5 * 240)
    const LINE_HEIGHT = 360;
    // Spacing after 8 pt = 160 twips (20 twips per point)
    const SPACING_AFTER = 160;
    const paraSpacing = { spacing: { line: LINE_HEIGHT, lineRule: LineRuleType.AUTO, after: SPACING_AFTER } };

    /** Title case for main headings; used for TOC rows and Abstract detection. */
    const normalizeMainHeadingTitle = (raw) =>
      (raw || '')
        .trim()
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    const isAbstractHeadingTitle = (raw) => normalizeMainHeadingTitle(raw) === 'Abstract';

    /** Items from the start through content before the first numbered chapter (non-Abstract main heading). */
    const splitAbstractPrefix = (list) => {
      const first = list[0];
      if (
        !first ||
        first.type !== 'heading' ||
        !(first.heading || '').trim() ||
        !isAbstractHeadingTitle(first.heading)
      ) {
        return { abstractItems: [], bodyItems: list };
      }
      let k = 1;
      while (k < list.length) {
        const it = list[k];
        if (it.type === 'heading' && (it.heading || '').trim() && !isAbstractHeadingTitle(it.heading)) break;
        k++;
      }
      return { abstractItems: list.slice(0, k), bodyItems: list.slice(k) };
    };
    const { abstractItems, bodyItems } = splitAbstractPrefix(items);

    // Prefetch all images in parallel (was the 2nd biggest delay after Puppeteer TOC measure).
    const imageBufCache = new Map();
    const imageUrls = [];
    for (const it of [...abstractItems, ...bodyItems]) {
      if (it && it.url) imageUrls.push(String(it.url).trim());
    }
    const uniqueImageUrls = [...new Set(imageUrls.filter(Boolean))];
    await mapPool(uniqueImageUrls, 8, async (url) => {
      const fullUrl = resolveReportImageUrl(url, req);
      const local = tryReadLocalReportImage(url, req) || tryReadLocalReportImage(fullUrl, req);
      if (local) {
        imageBufCache.set(url, local);
        imageBufCache.set(fullUrl, local);
        return;
      }
      try {
        const resp = await fetch(fullUrl);
        if (!resp.ok) {
          imageBufCache.set(url, null);
          imageBufCache.set(fullUrl, null);
          return;
        }
        const buf = Buffer.from(await resp.arrayBuffer());
        const ok = buf.length > 0 && buf.length < 5 * 1024 * 1024;
        imageBufCache.set(url, ok ? buf : null);
        imageBufCache.set(fullUrl, ok ? buf : null);
      } catch (err) {
        console.warn('Image prefetch failed:', url, err.message);
        imageBufCache.set(url, null);
        imageBufCache.set(fullUrl, null);
      }
    });

    const addHeading = (text, sizePt = 16, centered = true, opts = {}) => {
      const isMainHeading = sizePt >= 16 && centered;
      const prefix = opts.prefix || '';
      const raw = (text || ' ').trim();
      // Main headings: "Chapter 1: Introduction" (title case). Subheadings: "1.1 Overview" (as-is)
      const displayText = isMainHeading
        ? raw.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        : raw;
      const finalText = (prefix + displayText) || ' ';
      const pageBreak = opts.pageBreakBefore !== undefined ? opts.pageBreakBefore : false;
      const textRun = new TextRun({ text: finalText || ' ', font: 'Times New Roman', size: sizePt * 2, color: BLACK, bold: true });
      const paraChildren = opts.bookmarkId
        ? [new Bookmark({ id: opts.bookmarkId, children: [textRun] })]
        : [textRun];
      parts.push(new Paragraph({
        children: paraChildren,
        heading: sizePt >= 16 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
        alignment: centered ? AlignmentType.CENTER : AlignmentType.LEFT,
        pageBreakBefore: pageBreak,
        keepNext: true,
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
                parts.push(new Paragraph({
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
                  parts.push(new Paragraph({
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
            parts.push(new Paragraph({
              children: runs,
              alignment: AlignmentType.JUSTIFIED,
              ...paraSpacing
            }));
          }
        }
      } catch (err) {
        const text = (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text) {
          parts.push(new Paragraph({
            children: [new TextRun({ text, ...FONT_OPTS })],
            alignment: AlignmentType.JUSTIFIED,
            ...paraSpacing
          }));
        }
      }
    };

    // Usable area ≈ A4/Letter with 1" margins (~6.27" × 9.7" at 96dpi).
    // Diagrams: fill nearly one page under the section title — clear, no stretch, no spill.
    const PAGE_CONTENT_WIDTH = 600;
    const PAGE_CONTENT_HEIGHT = 520; // screenshots / DB (may stack)
    const DIAGRAM_CONTENT_WIDTH = 620;
    const DIAGRAM_CONTENT_HEIGHT = 760; // heading + one diagram stay on a single page
    const addImage = async (url, opts = {}) => {
      try {
        const fullUrl = resolveReportImageUrl(url, req);
        let buf = imageBufCache.has(fullUrl)
          ? imageBufCache.get(fullUrl)
          : (imageBufCache.has(url) ? imageBufCache.get(url) : undefined);
        if (buf === undefined) {
          const local = tryReadLocalReportImage(url, req) || tryReadLocalReportImage(fullUrl, req);
          if (local) {
            buf = local;
          } else {
            const resp = await fetch(fullUrl);
            if (!resp.ok) return;
            buf = Buffer.from(await resp.arrayBuffer());
          }
          imageBufCache.set(url, buf);
          imageBufCache.set(fullUrl, buf);
        }
        if (!buf || !buf.length || buf.length >= 5 * 1024 * 1024) return;
        const ext = (url.split('.').pop() || 'jpg').toLowerCase().replace(/\?.*$/, '');
        const type = ['png','jpg','jpeg','gif','bmp'].includes(ext) ? (ext === 'jpg' ? 'jpeg' : ext) : 'jpeg';
        const isDiagram = opts.role === 'diagram';
        const maxW = opts.maxWidth ?? (isDiagram ? DIAGRAM_CONTENT_WIDTH : PAGE_CONTENT_WIDTH);
        const maxH = opts.maxHeight ?? (isDiagram ? DIAGRAM_CONTENT_HEIGHT : PAGE_CONTENT_HEIGHT);
        // Allow upscale so small library diagrams fill the page; never stretch (uniform scale).
        const maxUpscale = opts.maxUpscale ?? (isDiagram ? 4 : 2.5);
        let width = maxW, height = maxH;
        try {
          const dims = getImageSize(buf);
          if (dims && dims.width && dims.height) {
            const scaleW = maxW / dims.width;
            const scaleH = maxH / dims.height;
            const scale = Math.min(scaleW, scaleH, maxUpscale);
            width = Math.max(50, Math.round(dims.width * scale));
            height = Math.max(50, Math.round(dims.height * scale));
          }
        } catch (_) { /* use defaults */ }
        parts.push(new Paragraph({
          children: [
            new ImageRun({
              type: type,
              data: buf,
              transformation: { width, height }
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: {
            line: LINE_HEIGHT,
            lineRule: LineRuleType.AUTO,
            after: isDiagram ? 120 : SPACING_AFTER,
            before: isDiagram ? 60 : 0
          }
        }));
      } catch (err) {
        console.warn('Image fetch failed:', url, err.message);
      }
    };

    /** Extra space below a datatable before the next block (twips). */
    const DATATABLE_GAP_TWIP = 280;

    const addCaption = (text, bold = true) => {
      if (!text) return;
      parts.push(new Paragraph({
        children: [new TextRun({ text, font: 'Times New Roman', size: 24, color: BLACK, bold })],
        alignment: AlignmentType.LEFT,
        // Keep label with the screenshot/table that follows (avoids orphan headings at page bottom).
        keepNext: true,
        ...paraSpacing
      }));
    };

    const normalizeCaptionKey = (s) =>
      String(s || '')
        .toLowerCase()
        .replace(/^\d+(\.\d+)*\s*/, '')
        .replace(/\bdiagram\b/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const isRedundantFigureCaption = (sectionTitle, caption) => {
      const a = normalizeCaptionKey(sectionTitle);
      const b = normalizeCaptionKey(caption);
      if (!a || !b) return false;
      return a === b || a.includes(b) || b.includes(a);
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
              parts.push(new Table({
                rows,
                width: { size: 100, type: WidthType.PERCENTAGE },
                layout: TableLayoutType.AUTOFIT
              }));
              parts.push(new Paragraph({
                spacing: {
                  before: DATATABLE_GAP_TWIP,
                  after: DATATABLE_GAP_TWIP,
                  line: LINE_HEIGHT,
                  lineRule: LineRuleType.AUTO
                },
                children: []
              }));
            }
          });
        } else {
          const runs = htmlToTextRuns(html);
          if (runs.length > 0) {
            parts.push(new Paragraph({
              children: runs,
              alignment: AlignmentType.JUSTIFIED,
              ...paraSpacing
            }));
          }
        }
      } catch (err) {
        const text = (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text) {
          parts.push(new Paragraph({
            children: [new TextRun({ text, ...FONT_OPTS })],
            alignment: AlignmentType.JUSTIFIED,
            ...paraSpacing
          }));
        }
      }
    };

    const pushChapterEndBookmark = (closedChapter) => {
      if (closedChapter <= 0) return;
      parts.push(new Paragraph({
        spacing: { after: 40, before: 0, line: LINE_HEIGHT, lineRule: LineRuleType.AUTO },
        children: [new Bookmark({
          id: `PRC_CH_END_${closedChapter}`,
          children: [new TextRun({ text: '\u200B', font: 'Times New Roman', size: 4, color: BLACK })]
        })]
      }));
    };

    const pushSubheadingEndBookmark = (ch, sub) => {
      if (sub <= 0 || ch < 0) return;
      parts.push(new Paragraph({
        spacing: { after: 40, before: 0, line: LINE_HEIGHT, lineRule: LineRuleType.AUTO },
        children: [new Bookmark({
          id: `PRC_SU_END_${ch}_${sub}`,
          children: [new TextRun({ text: '\u200B', font: 'Times New Roman', size: 4, color: BLACK })]
        })]
      }));
    };

    let idxAfterAbstract = 0;
    if (abstractItems.length > 0) {
      let absSubNum = 0;
      let absNextSubFirst = true;
      let lastSectionTitle = '';
      for (const it of abstractItems) {
        const type = (it.type || '').toString();
        if (type === 'heading') {
          const h = (it.heading || '').trim();
          if (!h) continue;
          if (absSubNum > 0) pushSubheadingEndBookmark(0, absSubNum);
          absSubNum = 0;
          absNextSubFirst = true;
          lastSectionTitle = h;
          addHeading(h, 16, true, { prefix: '', pageBreakBefore: false });
        } else if (type === 'subheading') {
          const s = (it.subheading || '').trim();
          if (!s) continue;
          if (absSubNum > 0) pushSubheadingEndBookmark(0, absSubNum);
          absSubNum++;
          lastSectionTitle = s;
          addHeading(s, 14, false, {
            pageBreakBefore: !absNextSubFirst,
            prefix: `${absSubNum}. `,
            bookmarkId: `PRC_SU_0_${absSubNum}`
          });
          absNextSubFirst = false;
          if (it.body) addBody(it.body);
        } else if (type === 'body') {
          addBody(it.body);
        } else if (type === 'db_screenshot') {
          addCaption(it.name || 'Database Screenshot', false);
          if (it.url) await addImage(it.url);
        } else if (type === 'db_datatable') {
          addCaption(it.name || 'Datatable', false);
          if (it.data_table) addDatatable(it.data_table);
        } else if (type === 'screenshot') {
          addCaption(it.name || 'Screenshot', false);
          if (it.url) await addImage(it.url);
        } else if (type === 'diagram') {
          const cap = it.label || it.diagram_type || 'Diagram';
          if (!isRedundantFigureCaption(lastSectionTitle, cap)) addCaption(cap);
          if (it.url) await addImage(it.url, { role: 'diagram' });
        }
      }
      if (absSubNum > 0) pushSubheadingEndBookmark(0, absSubNum);
      idxAfterAbstract = parts.length;
    }

    // TOC page numbers: body starts at page 1 (Introduction). Abstract/TOC are separate unnumbered sections.
    // Prefer real A4 measurement so Word TOC matches PDF / printed pagination.
    let tocPageMeta = estimateBodyTocPages(bodyItems);
    try {
      const baseUrl =
        (req.protocol || 'http') + '://' + (req.get('host') || 'localhost:5000');
      const imageDataUrls = bufferCacheToDataUrlMap(imageBufCache);
      const browser = await getSharedBrowser();
      tocPageMeta = await measureBodyTocPages(bodyItems, {
        baseUrl,
        browser,
        imageDataUrls,
        concurrency: 8
      });
    } catch (e) {
      console.warn('Word TOC measure failed, using estimate:', e.message || e);
    }
    const tocEntries = [];
    let tocSec = 0;
    let tocSub = 0;
    let tocMetaIdx = 0;
    for (const it of bodyItems) {
      if (it.type === 'heading' && (it.heading || '').trim()) {
        const chTitle = normalizeMainHeadingTitle(it.heading);
        tocSec++;
        tocSub = 0;
        const meta = tocPageMeta[tocMetaIdx++] || {};
        tocEntries.push({
          sNo: String(tocSec),
          chapter: chTitle,
          bookmarkId: `PRC_CH_${tocSec}`,
          chapterIdx: tocSec,
          isMain: true,
          pageLabel: formatTocPageLabel(meta.startPage || tocSec, meta.endPage || meta.startPage || tocSec)
        });
      } else if (it.type === 'subheading' && (it.subheading || '').trim()) {
        tocSub++;
        const sNo = `${tocSec}.${tocSub}`;
        const meta = tocPageMeta[tocMetaIdx++] || {};
        tocEntries.push({
          sNo,
          chapter: (it.subheading || '').trim(),
          bookmarkId: `PRC_SU_${tocSec}_${tocSub}`,
          endBookmarkId: `PRC_SU_END_${tocSec}_${tocSub}`,
          isMain: false,
          pageLabel: formatTocPageLabel(meta.startPage || 1, meta.endPage || meta.startPage || 1)
        });
      }
    }

    let tocBodyStartIndex = 0;
    if (tocEntries.length > 0) {
      parts.push(new Paragraph({
        children: [new TextRun({ text: 'Table of Contents', font: 'Times New Roman', size: 32, color: BLACK, bold: true })],
        alignment: AlignmentType.CENTER,
        pageBreakBefore: false,
        ...paraSpacing
      }));
      const tocRows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'S.No.', font: 'Times New Roman', size: TOC_FS, color: BLACK, bold: true })], ...paraSpacing })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Chapter', font: 'Times New Roman', size: TOC_FS, color: BLACK, bold: true })], ...paraSpacing })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Page No.', font: 'Times New Roman', size: TOC_FS, color: BLACK, bold: true })], ...paraSpacing })] })
          ]
        }),
        ...tocEntries.map((r) => {
          const b = r.isMain;
          return new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r.sNo, font: 'Times New Roman', size: TOC_FS, color: BLACK, bold: b })], ...paraSpacing })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r.chapter, font: 'Times New Roman', size: TOC_FS, color: BLACK, bold: b })], ...paraSpacing })] }),
              new TableCell({
                children: [new Paragraph({
                  alignment: AlignmentType.LEFT,
                  ...paraSpacing,
                  children: [
                    new TextRun({
                      text: r.pageLabel || '1',
                      font: 'Times New Roman',
                      size: TOC_FS,
                      color: BLACK,
                      bold: b
                    })
                  ]
                })]
              })
            ]
          });
        })
      ];
      parts.push(new Table({
        rows: tocRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.AUTOFIT
      }));
      tocBodyStartIndex = parts.length;
    }

    let nextSubheadingIsFirst = true;
    let chapterNum = 0;
    let subNum = 0;
    let lastSectionTitle = '';
    /** After a blank TOC placeholder, force the next block onto a new page. */
    let forcePageBreakBeforeNext = false;

    const padBlankPageAfterTitle = () => {
      parts.push(new Paragraph({
        spacing: { after: 0, before: 0, line: LINE_HEIGHT, lineRule: LineRuleType.AUTO },
        children: [new TextRun({ text: '\u00A0', font: 'Times New Roman', size: 24, color: BLACK })]
      }));
      forcePageBreakBeforeNext = true;
    };

    const sectionHasFollowingMedia = (fromIdx) => {
      for (let j = fromIdx + 1; j < bodyItems.length; j++) {
        const n = bodyItems[j];
        if (!n || !n.type) continue;
        if (n.type === 'heading' || n.type === 'subheading') return false;
        if (['diagram', 'screenshot', 'db_screenshot', 'db_datatable', 'body'].includes(n.type)) return true;
      }
      return false;
    };

    for (let i = 0; i < bodyItems.length; i++) {
      const it = bodyItems[i];
      const type = (it.type || '').toString();
      if (type === 'heading') {
        const h = (it.heading || '').trim();
        if (!h) continue;
        if (chapterNum > 0) {
          if (subNum > 0) pushSubheadingEndBookmark(chapterNum, subNum);
          pushChapterEndBookmark(chapterNum);
        } else if (subNum > 0) {
          pushSubheadingEndBookmark(0, subNum);
        }
        chapterNum++;
        subNum = 0;
        nextSubheadingIsFirst = true;
        lastSectionTitle = h;
        const breakBefore = chapterNum > 1 || forcePageBreakBeforeNext;
        forcePageBreakBeforeNext = false;
        addHeading(h, 16, true, {
          prefix: `Chapter ${chapterNum}: `,
          bookmarkId: `PRC_CH_${chapterNum}`,
          pageBreakBefore: breakBefore
        });
        if (it.blankPage && !sectionHasFollowingMedia(i)) padBlankPageAfterTitle();
      } else if (type === 'subheading') {
        const s = (it.subheading || '').trim();
        if (!s) continue;
        const subCh = chapterNum;
        if (subNum > 0) pushSubheadingEndBookmark(subCh, subNum);
        subNum++;
        lastSectionTitle = s;
        const breakBefore = !nextSubheadingIsFirst || forcePageBreakBeforeNext;
        forcePageBreakBeforeNext = false;
        addHeading(s, 14, false, {
          pageBreakBefore: breakBefore,
          prefix: chapterNum === 0 ? `${subNum}. ` : `${chapterNum}.${subNum} `,
          bookmarkId: `PRC_SU_${subCh}_${subNum}`
        });
        nextSubheadingIsFirst = false;
        if (it.body) addBody(it.body);
        else if (it.blankPage && !sectionHasFollowingMedia(i)) padBlankPageAfterTitle();
      } else if (type === 'body') {
        forcePageBreakBeforeNext = false;
        addBody(it.body);
      } else if (type === 'db_screenshot') {
        forcePageBreakBeforeNext = false;
        addCaption(it.name || 'Database Screenshot', false);
        if (it.url) await addImage(it.url);
      } else if (type === 'db_datatable') {
        forcePageBreakBeforeNext = false;
        addCaption(it.name || 'Datatable', false);
        if (it.data_table) addDatatable(it.data_table);
      } else if (type === 'screenshot') {
        forcePageBreakBeforeNext = false;
        addCaption(it.name || 'Screenshot', false);
        if (it.url) await addImage(it.url);
      } else if (type === 'diagram') {
        forcePageBreakBeforeNext = false;
        const cap = it.label || it.diagram_type || 'Diagram';
        if (!isRedundantFigureCaption(lastSectionTitle, cap)) addCaption(cap);
        if (it.url) await addImage(it.url, { role: 'diagram' });
      }
    }
    if (chapterNum > 0) {
      if (subNum > 0) pushSubheadingEndBookmark(chapterNum, subNum);
      pushChapterEndBookmark(chapterNum);
    } else if (subNum > 0) {
      pushSubheadingEndBookmark(0, subNum);
    }

    const pageMargins = {
      top: marginTwip,
      right: marginTwip,
      bottom: marginTwip,
      left: marginTwip
    };

    const emptyFooter = new Footer({
      children: [new Paragraph({ spacing: { after: 0, before: 0 }, children: [] })]
    });

    const bodyFooter = new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0, before: 0 },
          children: [
            new TextRun({
              font: 'Times New Roman',
              size: TOC_FS,
              color: BLACK,
              children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES_IN_SECTION]
            })
          ]
        })
      ]
    });

    const emptyDocFallback = [
      new Paragraph({ children: [new TextRun({ text: 'No content selected.', font: 'Times New Roman', size: 24, color: '000000' })], ...paraSpacing })
    ];

    const docSections = (() => {
      const sectMarginsOnly = { properties: { page: { margin: pageMargins } }, footers: { default: emptyFooter } };
      const sectBodyNumbered = {
        properties: {
          page: {
            margin: pageMargins,
            pageNumbers: { start: 1 }
          }
        },
        footers: { default: bodyFooter }
      };

      if (tocEntries.length > 0 && tocBodyStartIndex > 0) {
        const bodySlice = parts.slice(tocBodyStartIndex);
        if (idxAfterAbstract > 0) {
          return [
            { ...sectMarginsOnly, children: parts.slice(0, idxAfterAbstract) },
            { ...sectMarginsOnly, children: parts.slice(idxAfterAbstract, tocBodyStartIndex) },
            { ...sectBodyNumbered, children: bodySlice.length ? bodySlice : emptyDocFallback }
          ];
        }
        return [
          { ...sectMarginsOnly, children: parts.slice(0, tocBodyStartIndex) },
          { ...sectBodyNumbered, children: bodySlice.length ? bodySlice : emptyDocFallback }
        ];
      }

      if (idxAfterAbstract > 0) {
        const afterAbs = parts.slice(idxAfterAbstract);
        return [
          { ...sectMarginsOnly, children: parts.slice(0, idxAfterAbstract) },
          { ...sectBodyNumbered, children: afterAbs.length ? afterAbs : emptyDocFallback }
        ];
      }

      return [
        {
          ...sectBodyNumbered,
          children: parts.length ? parts : emptyDocFallback
        }
      ];
    })();

    const doc = new Document({
      features: {
        updateFields: true
      },
      styles: {
        default: {
          document: {
            paragraph: {
              spacing: { line: LINE_HEIGHT, lineRule: LineRuleType.AUTO }
            }
          }
        }
      },
      sections: docSections
    });

    const buf = await Packer.toBuffer(doc);
    const filename = baseName + '.docx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.send(buf);
  } catch (e) {
    console.error('PRC Word download error:', e);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
}

router.post('/api/download-word', requirePRCOrAdmin, handleProjectReportWordDownload);

/**
 * Instant Synopsis / Pre Defined pack download from library (same filters as checkout + sales).
 * GET /api/source-code/:id/download-pack?plan=synopsis|report&format=docx|pdf
 */
router.get('/api/source-code/:id/download-pack', requirePRCOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });

    const planRaw = String(req.query.plan || '').toLowerCase().trim();
    const plan = planRaw === 'synopsis' ? 'synopsis' : planRaw === 'report' ? 'report' : '';
    if (!plan) {
      return res.status(400).json({ ok: false, message: 'plan must be synopsis or report' });
    }
    const format = String(req.query.format || 'docx').toLowerCase() === 'pdf' ? 'pdf' : 'docx';

    const scRows = await queryAsync('SELECT id, name FROM source_code WHERE id=? LIMIT 1', [id]);
    if (!scRows.length) return res.status(404).json({ ok: false, message: 'Source code not found' });

    const lib = await loadPrcLibraryForExport(id);
    let items = buildFullReportItems({
      sections: lib.sectionsWithSub,
      dbScreenshots: lib.dbScreenshots,
      screenshots: lib.screenshots,
      diagrams: lib.diagramsList
    });
    items = plan === 'synopsis' ? filterSynopsisItems(items) : filterPredefinedReportItems(items);
    if (!items.length) {
      return res.status(400).json({ ok: false, message: 'Report content not ready for this project' });
    }

    const sourceCodeName =
      (scRows[0].name || 'Report').toString().trim() +
      (plan === 'synopsis' ? ' Synopsis' : ' Report');

    const prevBody = req.body;
    try {
      req.body = { sourceCodeId: id, sourceCodeName, items, format };
      await handleProjectReportWordDownload(req, res);
    } finally {
      req.body = prevBody;
    }
  } catch (e) {
    console.error('PRC download-pack error:', e);
    if (!res.headersSent) res.status(500).json({ ok: false, message: 'Could not generate file' });
  }
});

module.exports = router;
module.exports.handleProjectReportWordDownload = handleProjectReportWordDownload;
module.exports.loadPrcLibraryForExport = loadPrcLibraryForExport;
