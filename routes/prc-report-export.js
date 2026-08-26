'use strict';

/**
 * Shared helpers for project report Word/PDF export:
 * - TOC page numbers measured from real A4 layout (body starts at page 1 = Introduction)
 * - HTML → PDF via Puppeteer; footer stamped only on body pages
 */

const path = require('path');
const fs = require('fs');
const cheerio = require('cheerio');
const fetch = (typeof globalThis.fetch === 'function') ? globalThis.fetch : require('node-fetch');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const PUPPETEER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
let sharedBrowser = null;
let sharedBrowserPromise = null;

async function getSharedBrowser() {
  if (sharedBrowser && sharedBrowser.isConnected()) return sharedBrowser;
  if (!sharedBrowserPromise) {
    const puppeteer = require('puppeteer');
    sharedBrowserPromise = puppeteer
      .launch({ headless: true, args: PUPPETEER_ARGS })
      .then((b) => {
        sharedBrowser = b;
        b.on('disconnected', () => {
          sharedBrowser = null;
          sharedBrowserPromise = null;
        });
        return b;
      })
      .catch((err) => {
        sharedBrowserPromise = null;
        throw err;
      });
  }
  return sharedBrowserPromise;
}

// Word "Normal" margins: 2.54 cm (1") on all sides
const PRINT_MARGIN = { top: '1in', right: '1in', bottom: '1in', left: '1in' };
const CHARS_PER_PAGE = 2200;

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMainHeadingTitle(raw) {
  return (raw || '')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function isAbstractHeading(raw) {
  return normalizeMainHeadingTitle(raw) === 'Abstract';
}

function splitAbstractAndBody(items) {
  const list = Array.isArray(items) ? items : [];
  let i = 0;
  const abstractParts = [];
  if (list[0] && list[0].type === 'heading' && isAbstractHeading(list[0].heading)) {
    abstractParts.push(list[0]);
    i = 1;
    while (i < list.length) {
      const it = list[i];
      if (it.type === 'heading' && (it.heading || '').trim() && !isAbstractHeading(it.heading)) break;
      abstractParts.push(it);
      i++;
    }
  }
  return { abstractParts, bodyItems: list.slice(i) };
}

/**
 * Heuristic fallback (no browser): body page 1 = first body heading (Introduction).
 */
function estimateBodyTocPages(bodyItems) {
  const list = Array.isArray(bodyItems) ? bodyItems : [];
  const tocMeta = [];
  let page = 1;
  let tocSec = 0;
  let tocSub = 0;
  let blockStart = page;
  let blockChars = 0;
  let blockImages = 0;
  let blockIsMain = true;
  let blockSNo = '';
  let blockTitle = '';
  let open = false;

  const pagesForBlock = () =>
    Math.max(1, Math.ceil(Math.max(blockChars, 1) / CHARS_PER_PAGE) + blockImages);

  const closeBlock = () => {
    if (!open) return;
    const span = pagesForBlock();
    const startPage = blockStart;
    const endPage = blockStart + span - 1;
    tocMeta.push({
      sNo: blockSNo,
      chapter: blockTitle,
      isMain: blockIsMain,
      startPage,
      endPage
    });
    page = endPage + 1;
    open = false;
    blockChars = 0;
    blockImages = 0;
  };

  const openBlock = (isMain, sNo, title) => {
    closeBlock();
    blockStart = page;
    blockIsMain = isMain;
    blockSNo = sNo;
    blockTitle = title;
    open = true;
  };

  for (const it of list) {
    if (!it || !it.type) continue;
    const type = String(it.type);
    if (type === 'heading' && (it.heading || '').trim()) {
      tocSec += 1;
      tocSub = 0;
      openBlock(true, String(tocSec), normalizeMainHeadingTitle(it.heading));
      continue;
    }
    if (type === 'subheading' && (it.subheading || '').trim()) {
      tocSub += 1;
      const sNo = tocSec > 0 ? `${tocSec}.${tocSub}` : String(tocSub);
      openBlock(false, sNo, String(it.subheading).trim());
      if (it.body) blockChars += stripHtml(it.body).length;
      continue;
    }
    if (!open) continue;
    if (type === 'body' && it.body) blockChars += stripHtml(it.body).length;
    if (type === 'diagram' || type === 'screenshot' || type === 'db_screenshot') blockImages += 1;
    if (type === 'db_datatable' && it.data_table) blockChars += stripHtml(it.data_table).length + 400;
  }
  closeBlock();
  return expandMainChapterPageRanges(tocMeta);
}

function formatTocPageLabel(startPage, endPage) {
  const a = Number(startPage) || 1;
  let b = Number(endPage) || a;
  if (b < a) b = a;
  return `${a} – ${b}`;
}

/**
 * Main chapter TOC rows should span from chapter start → last subsection end
 * (not just the single page of the chapter title).
 */
function expandMainChapterPageRanges(tocMeta) {
  const list = Array.isArray(tocMeta) ? tocMeta : [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (!row || !row.isMain) continue;
    let end = Number(row.endPage) || Number(row.startPage) || 1;
    for (let j = i + 1; j < list.length; j++) {
      const next = list[j];
      if (!next) continue;
      if (next.isMain) break;
      const nextEnd = Number(next.endPage) || Number(next.startPage) || end;
      if (nextEnd > end) end = nextEnd;
    }
    row.endPage = end;
  }
  return list;
}

function absoluteUrl(url, baseUrl) {
  const u = (url || '').toString().trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  const base = (baseUrl || '').replace(/\/$/, '');
  return base + (u.startsWith('/') ? u : '/' + u);
}

function mimeFromUrl(url) {
  const ext = String(url || '')
    .split('?')[0]
    .split('.')
    .pop()
    .toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'bmp') return 'image/bmp';
  return 'image/jpeg';
}

function tryReadLocalPublicImage(absUrl, baseUrl) {
  try {
    let pathname = '';
    if (/^https?:\/\//i.test(absUrl)) {
      const parsed = new URL(absUrl);
      pathname = parsed.pathname || '';
    } else {
      pathname = absUrl;
    }
    if (!pathname.startsWith('/')) return null;
    const rel = pathname.replace(/^\//, '');
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

/**
 * Prefetch report images and return absoluteUrl → data: URI map.
 * Speeds up Chromium (no network wait) without changing image bytes/layout.
 */
/** Reuse prefetched Word image buffers as inline data URLs (skips network during TOC measure). */
function bufferCacheToDataUrlMap(cache) {
  const map = new Map();
  if (!cache || typeof cache.forEach !== 'function') return map;
  cache.forEach((buf, url) => {
    if (!buf || !buf.length || buf.length >= 5 * 1024 * 1024) return;
    const abs = String(url || '').trim();
    if (!abs) return;
    map.set(abs, `data:${mimeFromUrl(abs)};base64,${buf.toString('base64')}`);
  });
  return map;
}

function allItemsImagesInline(items, baseUrl, imageDataUrls) {
  for (const it of items || []) {
    if (!it || !it.url) continue;
    const abs = absoluteUrl(it.url, baseUrl);
    if (abs && imageDataUrls && !imageDataUrls.has(abs)) return false;
  }
  return true;
}

async function buildImageDataUrlMap(items, baseUrl, concurrency = 8) {
  const urls = new Set();
  for (const it of items || []) {
    if (!it || !it.url) continue;
    const abs = absoluteUrl(it.url, baseUrl);
    if (abs) urls.add(abs);
  }
  const map = new Map();
  await mapPool([...urls], concurrency, async (abs) => {
    try {
      let buf = tryReadLocalPublicImage(abs, baseUrl);
      if (!buf) {
        const resp = await fetch(abs);
        if (!resp.ok) return;
        buf = Buffer.from(await resp.arrayBuffer());
      }
      if (!buf || !buf.length || buf.length >= 5 * 1024 * 1024) return;
      const mime = mimeFromUrl(abs);
      map.set(abs, `data:${mime};base64,${buf.toString('base64')}`);
    } catch (_) { /* leave remote URL */ }
  });
  return map;
}

function resolveImgSrc(url, baseUrl, imageDataUrls) {
  const abs = absoluteUrl(url, baseUrl);
  if (!abs) return '';
  if (imageDataUrls && imageDataUrls.get) {
    if (imageDataUrls.has(abs)) return imageDataUrls.get(abs);
  }
  return abs;
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeBodyHtml(html) {
  const safe = String(html || '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  const $ = cheerio.load(`<div id="r">${safe}</div>`, { decodeEntities: false });
  $('#r a').each((_, el) => {
    $(el).replaceWith($(el).text());
  });
  return $('#r').html() || '';
}

function reportCss() {
  // Match Word Layout: Normal margins 1", indent 0/0, spacing Before 0 / After 8 pt, line spacing 1.5
  return `
  @page { size: A4; margin: 1in; }
  * { box-sizing: border-box; }
  html, body {
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt;
    line-height: 1.5;
    color: #000;
    margin: 0;
    padding: 0;
  }
  p, h1, h2, h3, li, td, th, div.body {
    margin-top: 0;
    margin-bottom: 8pt;
    margin-left: 0;
    margin-right: 0;
    padding: 0;
    line-height: 1.5;
  }
  .sec-abstract { page-break-after: always; }
  .sec-toc { page-break-after: always; }
  .h-toc {
    page-break-after: avoid;
    text-align: center;
    font-size: 16pt;
    font-weight: bold;
    margin: 0 0 8pt;
    line-height: 1.5;
  }
  .sec-body { }
  .h-main {
    text-align: center;
    font-size: 16pt;
    font-weight: bold;
    margin: 0 0 8pt;
    padding: 0;
    page-break-after: avoid;
    line-height: 1.5;
  }
  .h-sub {
    text-align: left;
    font-size: 14pt;
    font-weight: bold;
    margin: 0 0 8pt;
    padding: 0;
    page-break-after: avoid;
    line-height: 1.5;
  }
  .page-break { page-break-before: always; }
  .body {
    text-align: justify;
    margin: 0;
    padding: 0;
    line-height: 1.5;
  }
  .body p {
    text-align: justify;
    margin: 0 0 8pt;
    padding: 0;
    line-height: 1.5;
  }
  .body p:last-child { margin-bottom: 8pt; }
  .body ul, .body ol {
    margin: 0 0 8pt;
    padding-left: 24pt;
    line-height: 1.5;
  }
  .body li {
    margin: 0 0 8pt;
    padding: 0;
    line-height: 1.5;
  }
  .cap {
    font-weight: bold;
    margin: 0 0 8pt;
    padding: 0;
    page-break-after: avoid;
    line-height: 1.5;
  }
  .img-wrap {
    text-align: center;
    margin: 0 0 8pt;
    padding: 0;
    page-break-inside: avoid;
  }
  .img-wrap img {
    max-width: 100%;
    max-height: 170mm;
    width: auto;
    height: auto;
    object-fit: contain;
  }
  /* Architecture / DFD / UML / ER: one clear diagram per page, no stretch */
  .img-wrap.diagram {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .img-wrap.diagram img {
    max-width: 100%;
    max-height: 220mm;
    width: auto;
    height: auto;
    object-fit: contain;
  }
  table.toc {
    width: 100%;
    border-collapse: collapse;
    font-size: 12pt;
    border: 1px solid #000;
    margin: 0 0 8pt;
  }
  table.toc th, table.toc td {
    text-align: left;
    padding: 4pt 6pt;
    vertical-align: top;
    border: 1px solid #000;
    margin: 0;
    line-height: 1.5;
  }
  table.toc th { font-weight: bold; }
  table.toc tr.main td { font-weight: bold; }
  .body table { width: 100%; border-collapse: collapse; margin: 0 0 8pt; }
  .body table td, .body table th {
    border: 1px solid #333;
    padding: 4pt 6pt;
    font-size: 11pt;
    line-height: 1.5;
  }
`;
}

function wrapHtmlDocument(title, bodyInner) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>${escHtml(title || 'Report')}</title>
<style>${reportCss()}</style>
</head><body>${bodyInner}</body></html>`;
}

function renderBlocksHtml(chunk, opts = {}) {
  const {
    chapterPrefix = false,
    startChapter = 0,
    baseUrl = '',
    suppressPageBreaks = false,
    chapterNumberLabel = null,
    imageDataUrls = null
  } = opts;
  let html = '';
  let chapterNum = startChapter;
  let subNum = 0;
  let nextSubFirst = true;
  let lastSectionTitle = '';

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

  for (const it of chunk) {
    const type = (it.type || '').toString();
    if (type === 'heading') {
      const h = (it.heading || '').trim();
      if (!h) continue;
      chapterNum += 1;
      subNum = 0;
      nextSubFirst = true;
      lastSectionTitle = h;
      const displayNum = chapterNumberLabel != null ? chapterNumberLabel : chapterNum;
      const label = chapterPrefix
        ? `Chapter ${displayNum}: ${normalizeMainHeadingTitle(h)}`
        : normalizeMainHeadingTitle(h);
      const br = !suppressPageBreaks && chapterPrefix && chapterNum > 1 ? ' page-break' : '';
      html += `<h1 class="h-main${br}" id="ch-${displayNum}">${escHtml(label)}</h1>`;
    } else if (type === 'subheading') {
      const s = (it.subheading || '').trim();
      if (!s) continue;
      subNum += 1;
      lastSectionTitle = s;
      const prefix = chapterNum === 0 ? `${subNum}. ` : `${chapterNum}.${subNum} `;
      const br = !suppressPageBreaks && !nextSubFirst ? ' page-break' : '';
      nextSubFirst = false;
      html += `<h2 class="h-sub${br}">${escHtml(prefix + s)}</h2>`;
      if (it.body) html += `<div class="body">${sanitizeBodyHtml(it.body)}</div>`;
    } else if (type === 'body') {
      if (it.body) html += `<div class="body">${sanitizeBodyHtml(it.body)}</div>`;
    } else if (type === 'diagram') {
      const cap = it.label || it.diagram_type || 'Figure';
      const src = resolveImgSrc(it.url, baseUrl, imageDataUrls);
      if (!isRedundantFigureCaption(lastSectionTitle, cap)) {
        html += `<p class="cap">${escHtml(cap)}</p>`;
      }
      if (src) html += `<p class="img-wrap diagram"><img src="${escHtml(src)}" alt=""/></p>`;
    } else if (type === 'screenshot' || type === 'db_screenshot') {
      const cap = it.label || it.name || 'Figure';
      const src = resolveImgSrc(it.url, baseUrl, imageDataUrls);
      html += `<p class="cap">${escHtml(cap)}</p>`;
      if (src) html += `<p class="img-wrap"><img src="${escHtml(src)}" alt=""/></p>`;
    } else if (type === 'db_datatable') {
      html += `<p class="cap">${escHtml(it.name || 'Datatable')}</p>`;
      if (it.data_table) html += `<div class="body">${sanitizeBodyHtml(it.data_table)}</div>`;
    }
  }
  return html;
}

/** Split body into TOC blocks (heading / subheading), matching Word page-break rules. */
function splitBodyTocBlocks(bodyItems) {
  const list = Array.isArray(bodyItems) ? bodyItems : [];
  const blocks = [];
  let current = null;
  let tocSec = 0;
  let tocSub = 0;

  for (const it of list) {
    if (!it || !it.type) continue;
    if (it.type === 'heading' && (it.heading || '').trim()) {
      tocSec += 1;
      tocSub = 0;
      current = {
        sNo: String(tocSec),
        chapter: normalizeMainHeadingTitle(it.heading),
        isMain: true,
        chapterNum: tocSec,
        items: [it]
      };
      blocks.push(current);
      continue;
    }
    if (it.type === 'subheading' && (it.subheading || '').trim()) {
      tocSub += 1;
      current = {
        sNo: tocSec > 0 ? `${tocSec}.${tocSub}` : String(tocSub),
        chapter: String(it.subheading).trim(),
        isMain: false,
        chapterNum: tocSec,
        items: [it]
      };
      blocks.push(current);
      continue;
    }
    if (current) current.items.push(it);
  }
  return blocks;
}

async function waitForDocumentImages(page, timeoutMs = 20000) {
  try {
    await page.evaluate(async (ms) => {
      const imgs = Array.from(document.images || []);
      await Promise.race([
        Promise.all(
          imgs.map((img) => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolve) => {
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
            });
          })
        ),
        new Promise((resolve) => setTimeout(resolve, ms))
      ]);
    }, timeoutMs);
  } catch (_) { /* ignore */ }
}

async function setPageHtmlForPdf(page, html, opts = {}) {
  const inlineImages = opts.allImagesInline === true;
  await page.setContent(html, {
    waitUntil: inlineImages ? 'load' : 'networkidle0',
    timeout: inlineImages ? 45000 : 120000
  });
  await waitForDocumentImages(page, inlineImages ? 2500 : 5000);
}

async function pdfPageCountOnPage(page, html, opts = {}) {
  await setPageHtmlForPdf(page, html, opts);
  const buf = await page.pdf({
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: false,
    margin: PRINT_MARGIN
  });
  const doc = await PDFDocument.load(buf);
  return { count: doc.getPageCount(), buffer: Buffer.from(buf) };
}

async function pdfPageCount(browser, html, opts = {}) {
  const page = await browser.newPage();
  try {
    return await pdfPageCountOnPage(page, html, opts);
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Measure real A4 page ranges for body TOC entries.
 * Page 1 = first body section (Introduction), Abstract/TOC are excluded.
 * Same per-block Chromium measure as before; runs several blocks in parallel for speed only.
 */
async function measureBodyTocPages(bodyItems, { baseUrl = '', browser = null, concurrency = 8, imageDataUrls = null } = {}) {
  const blocks = splitBodyTocBlocks(bodyItems);
  if (!blocks.length) return [];

  const b = browser || (await getSharedBrowser());
  const dataUrls = imageDataUrls || (await buildImageDataUrlMap(bodyItems, baseUrl));
  const allInline = allItemsImagesInline(bodyItems, baseUrl, dataUrls);
  const pdfOpts = { allImagesInline: allInline };

  const poolSize = Math.min(Math.max(1, concurrency || 1), blocks.length);
  const pages = await Promise.all(Array.from({ length: poolSize }, () => b.newPage()));
  const counts = new Array(blocks.length);
  let nextBlock = 0;

  const runWorker = async (page) => {
    while (true) {
      const i = nextBlock++;
      if (i >= blocks.length) return;
      const block = blocks[i];
      const inner = renderBlocksHtml(block.items, {
        chapterPrefix: block.isMain,
        startChapter: 0,
        chapterNumberLabel: block.isMain ? block.chapterNum : null,
        suppressPageBreaks: true,
        baseUrl,
        imageDataUrls: dataUrls
      });
      const html = wrapHtmlDocument('measure', inner);
      const { count } = await pdfPageCountOnPage(page, html, pdfOpts);
      counts[i] = Math.max(1, count || 1);
    }
  };

  try {
    await Promise.all(pages.map((page) => runWorker(page)));

    let page = 1;
    const tocMeta = [];
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const n = Math.max(1, counts[i] || 1);
      tocMeta.push({
        sNo: block.sNo,
        chapter: block.chapter,
        isMain: block.isMain,
        startPage: page,
        endPage: page + n - 1
      });
      page += n;
    }
    return expandMainChapterPageRanges(tocMeta);
  } finally {
    await Promise.all(pages.map((p) => p.close().catch(() => {})));
  }
}

function buildTocTableHtml(tocMeta) {
  if (!tocMeta || !tocMeta.length) return '';
  let tocHtml =
    `<h1 class="h-toc">Table of Contents</h1><table class="toc"><thead><tr>` +
    `<th>S.No.</th><th>Chapter</th><th>Page No.</th></tr></thead><tbody>`;
  for (const r of tocMeta) {
    const bold = r.isMain ? ' class="main"' : '';
    tocHtml += `<tr${bold}><td>${escHtml(r.sNo)}</td><td>${escHtml(r.chapter)}</td><td>${escHtml(
      formatTocPageLabel(r.startPage, r.endPage)
    )}</td></tr>`;
  }
  tocHtml += `</tbody></table>`;
  return tocHtml;
}

function buildReportHtmlDocument({ title, items, baseUrl, tocMeta, imageDataUrls }) {
  const { abstractParts, bodyItems } = splitAbstractAndBody(items);
  const meta = Array.isArray(tocMeta) && tocMeta.length ? tocMeta : estimateBodyTocPages(bodyItems);

  const abstractHtml = abstractParts.length
    ? `<section class="sec-abstract">${renderBlocksHtml(abstractParts, {
        chapterPrefix: false,
        baseUrl,
        imageDataUrls
      })}</section>`
    : '';
  const tocHtml = meta.length
    ? `<section class="sec-toc">${buildTocTableHtml(meta)}</section>`
    : '';
  const bodyHtml = `<section class="sec-body">${renderBlocksHtml(bodyItems, {
    chapterPrefix: true,
    startChapter: 0,
    baseUrl,
    imageDataUrls
  })}</section>`;

  return wrapHtmlDocument(title, `${abstractHtml}${tocHtml}${bodyHtml}`);
}

async function stampBodyPageNumbers(pdfBuffer, frontPageCount) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const front = Math.max(0, Math.min(frontPageCount || 0, pages.length));
  const bodyTotal = Math.max(0, pages.length - front);
  if (bodyTotal <= 0) return Buffer.from(await pdfDoc.save());

  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  for (let i = front; i < pages.length; i++) {
    const pageNum = i - front + 1;
    const page = pages[i];
    const { width } = page.getSize();
    const text = `Page ${pageNum} of ${bodyTotal}`;
    const size = 10;
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: Math.max(72, (width - textWidth) / 2),
      y: 54,
      size,
      font,
      color: rgb(0, 0, 0)
    });
  }
  return Buffer.from(await pdfDoc.save());
}

async function buildReportPdfBuffer({ title, items, baseUrl }) {
  const { abstractParts, bodyItems } = splitAbstractAndBody(items);
  const imageDataUrls = await buildImageDataUrlMap(items, baseUrl);
  const allInline = allItemsImagesInline(items, baseUrl, imageDataUrls);
  const pdfOpts = { allImagesInline: allInline };

  const browser = await getSharedBrowser();
  const renderPage = await browser.newPage();

  try {
    // Accurate TOC pages from real body layout (page 1 = Introduction)
    let tocMeta = estimateBodyTocPages(bodyItems);
    try {
      tocMeta = await measureBodyTocPages(bodyItems, { baseUrl, browser, imageDataUrls, concurrency: 8 });
    } catch (e) {
      console.warn('TOC measure failed, using estimate:', e.message || e);
    }

    // Front matter page count (Abstract + TOC) — these stay unnumbered
    const frontInner =
      (abstractParts.length
        ? `<section class="sec-abstract">${renderBlocksHtml(abstractParts, {
            chapterPrefix: false,
            baseUrl,
            imageDataUrls
          })}</section>`
        : '') +
      (tocMeta.length ? `<section class="sec-toc">${buildTocTableHtml(tocMeta)}</section>` : '');
    let frontCount = 0;
    if (frontInner) {
      const frontHtml = wrapHtmlDocument(title, frontInner);
      const front = await pdfPageCountOnPage(renderPage, frontHtml, pdfOpts);
      frontCount = front.count || 0;
    }

    // Full document PDF (no Chrome footer — we stamp body-only numbers)
    const fullHtml = buildReportHtmlDocument({ title, items, baseUrl, tocMeta, imageDataUrls });
    await setPageHtmlForPdf(renderPage, fullHtml, pdfOpts);
    const rawPdf = Buffer.from(
      await renderPage.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: false,
        margin: PRINT_MARGIN
      })
    );

    return await stampBodyPageNumbers(rawPdf, frontCount);
  } finally {
    await renderPage.close().catch(() => {});
  }
}

module.exports = {
  estimateBodyTocPages,
  measureBodyTocPages,
  expandMainChapterPageRanges,
  formatTocPageLabel,
  normalizeMainHeadingTitle,
  splitAbstractAndBody,
  buildReportHtmlDocument,
  buildReportPdfBuffer,
  buildImageDataUrlMap,
  bufferCacheToDataUrlMap,
  getSharedBrowser,
  absoluteUrl
};
