'use strict';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineFormat(line) {
  let s = escapeHtml(line);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return s;
}

function isTabTableRow(line) {
  const t = String(line).trim();
  if (!t.includes('\t')) return false;
  const cells = t.split('\t').map((c) => c.trim());
  return cells.length >= 3 && cells.every((c) => c.length > 0);
}

function parseTabTableRow(line) {
  return String(line)
    .trim()
    .split('\t')
    .map((c) => c.trim());
}

function isTableRow(line) {
  return /^\|.+\|$/.test(String(line).trim());
}

function parseTableRow(line) {
  return String(line)
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function isTableSep(line) {
  return /^\|[-:\s|]+\|$/.test(String(line).trim());
}

/**
 * Convert editorial markdown body (no front matter H1) to FileMakr blog HTML.
 */
function markdownArticleToBlogHtml(md) {
  const lines = String(md || '').split(/\r?\n/);
  const out = [];
  let i = 0;
  let inCode = false;
  let codeLang = '';
  const codeBuf = [];

  function flushCode() {
    if (!codeBuf.length) return;
    const body = codeBuf.join('\n');
    out.push(`<pre><code>${escapeHtml(body)}</code></pre>`);
    codeBuf.length = 0;
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCode) {
        inCode = false;
        flushCode();
        codeLang = '';
      } else {
        inCode = true;
        codeLang = trimmed.slice(3).trim();
      }
      i += 1;
      continue;
    }

    if (inCode) {
      codeBuf.push(line);
      i += 1;
      continue;
    }

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^\*\*Editorial and publication note/i.test(trimmed)) break;
    if (/^<!-- PUBLIC ARTICLE END -->/i.test(trimmed)) break;
    if (/^\d+\.\sInternal Linking Strategy/i.test(trimmed)) break;
    if (/^Direction \/ context/i.test(trimmed)) break;

    if (trimmed.startsWith('![')) {
      const m = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      if (m) {
        const alt = m[1];
        const src = m[2];
        if (!/^assets\//i.test(src)) {
          out.push(`<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async"><figcaption>${escapeHtml(alt)}</figcaption></figure>`);
        } else {
          out.push(`<p><em>${escapeHtml(alt)}</em></p>`);
        }
      }
      i += 1;
      continue;
    }

    if (isTabTableRow(trimmed)) {
      const rows = [];
      while (i < lines.length && isTabTableRow(lines[i].trim())) {
        rows.push(parseTabTableRow(lines[i]));
        i += 1;
      }
      if (rows.length) {
        out.push('<div class="bd-table-wrap"><table><thead><tr>');
        rows[0].forEach((cell) => {
          out.push(`<th>${inlineFormat(cell)}</th>`);
        });
        out.push('</tr></thead><tbody>');
        for (let r = 1; r < rows.length; r += 1) {
          out.push('<tr>');
          rows[r].forEach((cell) => {
            out.push(`<td>${inlineFormat(cell)}</td>`);
          });
          out.push('</tr>');
        }
        out.push('</tbody></table></div>');
      }
      continue;
    }

    if (isTableRow(trimmed)) {
      const rows = [];
      while (i < lines.length && isTableRow(lines[i].trim())) {
        if (!isTableSep(lines[i].trim())) rows.push(parseTableRow(lines[i]));
        i += 1;
      }
      if (rows.length) {
        out.push('<div class="bd-table-wrap"><table><thead><tr>');
        rows[0].forEach((cell) => {
          out.push(`<th>${inlineFormat(cell)}</th>`);
        });
        out.push('</tr></thead><tbody>');
        for (let r = 1; r < rows.length; r += 1) {
          out.push('<tr>');
          rows[r].forEach((cell) => {
            out.push(`<td>${inlineFormat(cell)}</td>`);
          });
          out.push('</tr>');
        }
        out.push('</tbody></table></div>');
      }
      continue;
    }

    if (/^### /.test(trimmed)) {
      out.push(`<h3>${inlineFormat(trimmed.slice(4))}</h3>`);
      i += 1;
      continue;
    }

    if (/^## /.test(trimmed)) {
      out.push(`<h2>${inlineFormat(trimmed.slice(3))}</h2>`);
      i += 1;
      continue;
    }

    if (/^# /.test(trimmed)) {
      i += 1;
      continue;
    }

    if (/^[-*] /.test(trimmed)) {
      out.push('<ul>');
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
        out.push(`<li>${inlineFormat(lines[i].trim().replace(/^[-*] /, ''))}</li>`);
        i += 1;
      }
      out.push('</ul>');
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      out.push('<ol>');
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        out.push(`<li>${inlineFormat(lines[i].trim().replace(/^\d+\.\s/, ''))}</li>`);
        i += 1;
      }
      out.push('</ol>');
      continue;
    }

    out.push(`<p>${inlineFormat(trimmed)}</p>`);
    i += 1;
  }

  return out.join('\n');
}

module.exports = { markdownArticleToBlogHtml };
