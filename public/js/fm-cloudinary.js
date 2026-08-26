(function (w) {
  if (w.fmCloudinary && w.fmCloudinary._v6) return;

  function cdnBase() {
    return (w.FM_CLOUDINARY_CDN_BASE || '').toString().trim().replace(/\/$/, '');
  }
  function cdnHost() {
    return (w.FM_CLOUDINARY_CDN || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '');
  }
  function esc(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function normHostPath(s) {
    return String(s || '')
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/$/, '')
      .toLowerCase();
  }

  /* Match res.cloudinary or site /cloudinary/{cloud}/upload paths (www or bare). */
  function isCl(u) {
    u = String(u || '').trim();
    if (!u) return false;
    if (/^(https?:)?\/\/res\.cloudinary\.com\/[^/]+\/(?:image|video|raw)\/upload\//i.test(u)) {
      return true;
    }
    // Worker proxy: https://filemakr.com/cloudinary/{cloud}/image/upload/...
    if (/^(https?:)?\/\/(?:www\.)?[^/]+\/cloudinary\/[^/]+\/(?:image|video|raw)\/upload\//i.test(u)) {
      return true;
    }
    var b = cdnBase();
    if (b && normHostPath(u).indexOf(normHostPath(b) + '/') === 0) return true;
    var c = cdnHost();
    if (
      c &&
      new RegExp(
        '^(https?:)?\\/\\/(?:www\\.)?' + esc(c) + '\\/[^/]+\\/(?:image|video|raw)\\/upload\\/',
        'i'
      ).test(u)
    ) {
      return true;
    }
    return false;
  }

  function toCdn(u) {
    u = String(u || '').trim();
    if (!/^https?:\/\/res\.cloudinary\.com\//i.test(u)) return u;
    var b = cdnBase();
    if (b) return u.replace(/^https?:\/\/res\.cloudinary\.com/i, b);
    var c = cdnHost();
    if (c) return u.replace(/^https?:\/\/res\.cloudinary\.com/i, 'https://' + c);
    return u;
  }

  function hasTx(u) {
    var s = String(u || '');
    var low = s.toLowerCase();
    var m = '/image/upload/';
    if (low.indexOf(m) < 0) {
      if (low.indexOf('/video/upload/') >= 0) m = '/video/upload/';
      else if (low.indexOf('/raw/upload/') >= 0) m = '/raw/upload/';
      else return false;
    }
    var f = s.slice(low.indexOf(m) + m.length).split('/')[0] || '';
    if (!f) return false;
    if (/^v\d+$/i.test(f)) return false;
    return /[_]|[,]|^(f_|q_|w_|h_|c_|dpr_|e_)/i.test(f);
  }

  function upQ(u) {
    return String(u || '').replace(
      /(\/(?:image|video|raw)\/upload\/)([^/]*)/i,
      function (full, a, tx) {
        if (!tx || /^v\d+$/i.test(tx)) return full;
        var parts = tx
          .split(',')
          .map(function (p) {
            return p.trim();
          })
          .filter(Boolean);
        var ch = false;
        parts = parts.map(function (p) {
          if (/^q_auto(?::(?:eco|low))?$/i.test(p)) {
            ch = true;
            return 'q_auto:best';
          }
          return p;
        });
        return ch ? a + parts.join(',') : full;
      }
    );
  }

  function injectWidth(u, n, sharpen) {
    if (!isFinite(n) || n <= 0) return u;
    return u.replace(/(\/(?:image|video|raw)\/upload\/)([^/]*)(\/|$)/i, function (_, a, tx, z) {
      var parts;
      if (!tx || /^v\d+$/i.test(tx)) {
        parts = ['f_auto', 'q_auto:best', 'w_' + n, 'c_limit'];
        if (sharpen) parts.push('e_sharpen:60');
        return a + parts.join(',') + (z === '/' ? '/' : z ? z : '/');
      }
      parts = tx
        .split(',')
        .map(function (p) {
          return p.trim();
        })
        .filter(Boolean)
        .filter(function (p) {
          return !/^w_/i.test(p) && !/^e_sharpen/i.test(p);
        });
      if (!parts.some(function (p) { return /^f_/i.test(p); })) parts.unshift('f_auto');
      if (!parts.some(function (p) { return /^q_/i.test(p); })) parts.push('q_auto:best');
      parts.push('w_' + n);
      if (!parts.some(function (p) { return /^c_/i.test(p); })) parts.push('c_limit');
      if (sharpen) parts.push('e_sharpen:60');
      return a + parts.join(',') + (z || '');
    });
  }

  function url(u, o) {
    u = String(u || '').trim();
    if (!u || !isCl(u)) return u;
    o = o || {};
    var n = parseInt(o.width, 10);
    var sharpen = o.sharpen !== false && isFinite(n) && n > 0 && n <= 1280;
    if (!hasTx(u)) {
      var p = ['f_auto', 'q_auto:best'];
      if (isFinite(n) && n > 0) {
        p.push('w_' + n);
        p.push('c_limit');
        if (sharpen) p.push('e_sharpen:60');
      }
      u = u.replace(/(\/(?:image|video|raw)\/upload\/)/i, '$1' + p.join(',') + '/');
    } else {
      u = upQ(u);
      if (isFinite(n) && n > 0) u = injectWidth(u, n, sharpen);
    }
    return toCdn(u);
  }

  function srcSet(u, ws) {
    u = String(u || '').trim();
    if (!u) return '';
    ws = ws && ws.length ? ws : [640, 960, 1280];
    if (!isCl(u)) return u + ' ' + ws[0] + 'w';
    return ws
      .map(function (n) {
        return url(u, { width: n }) + ' ' + n + 'w';
      })
      .join(', ');
  }

  w.fmCloudinary = { url: url, srcSet: srcSet, toCdn: toCdn, isCl: isCl, _v6: 1 };
})(window);
