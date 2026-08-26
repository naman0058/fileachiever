/**
 * FileMakr download progress overlay — percentage + bar while Word/PDF generates.
 * Usage:
 *   FmDownloadProgress.start({ title: 'Preparing Word…' });
 *   // … long fetch …
 *   FmDownloadProgress.finish();
 * Or:
 *   FmDownloadProgress.fetchAndSave(url, { label: 'Preparing PDF…', filename: 'report.pdf' });
 */
(function (global) {
  var overlayEl = null;
  var barEl = null;
  var pctEl = null;
  var titleEl = null;
  var subEl = null;
  var simTimer = null;
  var pct = 0;
  var active = false;

  var STAGES = [
    { at: 0, text: 'Collecting report content…' },
    { at: 18, text: 'Matching sections & diagrams…' },
    { at: 38, text: 'Building document layout…' },
    { at: 58, text: 'Rendering pages & images…' },
    { at: 78, text: 'Finalizing file…' },
    { at: 92, text: 'Almost ready…' }
  ];

  function ensureDom() {
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.id = 'fmDlProgress';
    overlayEl.setAttribute('role', 'alertdialog');
    overlayEl.setAttribute('aria-live', 'polite');
    overlayEl.setAttribute('aria-busy', 'true');
    overlayEl.innerHTML =
      '<div class="fm-dl-progress__card">' +
      '  <div class="fm-dl-progress__icon" aria-hidden="true">' +
      '    <span class="fm-dl-progress__spin"></span>' +
      '  </div>' +
      '  <div class="fm-dl-progress__title" id="fmDlProgressTitle">Preparing download…</div>' +
      '  <div class="fm-dl-progress__sub" id="fmDlProgressSub">Please wait</div>' +
      '  <div class="fm-dl-progress__pct" id="fmDlProgressPct">0%</div>' +
      '  <div class="fm-dl-progress__track" aria-hidden="true">' +
      '    <div class="fm-dl-progress__bar" id="fmDlProgressBar"></div>' +
      '  </div>' +
      '  <div class="fm-dl-progress__hint">Do not close this tab while the file is being prepared.</div>' +
      '</div>';

    var style = document.createElement('style');
    style.textContent =
      '#fmDlProgress{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;' +
      'padding:20px;background:rgba(11,18,32,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}' +
      '#fmDlProgress.is-open{display:flex;}' +
      '.fm-dl-progress__card{width:min(420px,100%);background:#fff;border-radius:16px;border:1px solid #E8ECF2;' +
      'box-shadow:0 24px 60px rgba(14,18,32,.28);padding:28px 24px 22px;text-align:center;' +
      'font-family:IBM Plex Sans,Plus Jakarta Sans,system-ui,sans-serif;color:#0B1220;}' +
      '.fm-dl-progress__icon{margin:0 auto 14px;width:48px;height:48px;display:flex;align-items:center;justify-content:center;}' +
      '.fm-dl-progress__spin{width:36px;height:36px;border-radius:50%;border:3px solid #EEF2FF;border-top-color:#F17F23;' +
      'animation:fmDlSpin .8s linear infinite;}' +
      '@keyframes fmDlSpin{to{transform:rotate(360deg)}}' +
      '.fm-dl-progress__title{font-size:17px;font-weight:800;letter-spacing:-.02em;margin:0 0 6px;}' +
      '.fm-dl-progress__sub{font-size:13px;font-weight:600;color:#64748B;margin:0 0 14px;min-height:1.3em;}' +
      '.fm-dl-progress__pct{font-size:28px;font-weight:800;letter-spacing:-.03em;color:#2A47FF;margin:0 0 10px;}' +
      '.fm-dl-progress__track{height:10px;border-radius:999px;background:#EEF2F7;overflow:hidden;margin:0 0 12px;}' +
      '.fm-dl-progress__bar{height:100%;width:0%;border-radius:999px;' +
      'background:linear-gradient(90deg,#F17F23,#2A47FF);transition:width .35s ease;}' +
      '.fm-dl-progress__hint{font-size:11px;font-weight:600;color:#94A3B8;line-height:1.4;}' +
      '#fmDlProgress.is-done .fm-dl-progress__spin{border-top-color:#16A34A;animation:none;border-color:#16A34A;}' +
      '#fmDlProgress.is-done .fm-dl-progress__pct{color:#16A34A;}';

    document.head.appendChild(style);
    document.body.appendChild(overlayEl);
    barEl = document.getElementById('fmDlProgressBar');
    pctEl = document.getElementById('fmDlProgressPct');
    titleEl = document.getElementById('fmDlProgressTitle');
    subEl = document.getElementById('fmDlProgressSub');
  }

  function stageFor(p) {
    var text = STAGES[0].text;
    for (var i = 0; i < STAGES.length; i++) {
      if (p >= STAGES[i].at) text = STAGES[i].text;
    }
    return text;
  }

  function render() {
    if (!barEl) return;
    var shown = Math.max(0, Math.min(100, Math.round(pct)));
    barEl.style.width = shown + '%';
    pctEl.textContent = shown + '%';
    if (subEl && shown < 100) subEl.textContent = stageFor(shown);
  }

  function stopSim() {
    if (simTimer) {
      clearInterval(simTimer);
      simTimer = null;
    }
  }

  function startSim() {
    stopSim();
    simTimer = setInterval(function () {
      if (!active) return;
      if (pct >= 92) return;
      var step;
      if (pct < 20) step = 2.8;
      else if (pct < 45) step = 1.6;
      else if (pct < 70) step = 0.85;
      else if (pct < 85) step = 0.4;
      else step = 0.18;
      pct = Math.min(92, pct + step);
      render();
    }, 350);
  }

  function start(opts) {
    opts = opts || {};
    ensureDom();
    active = true;
    pct = 0;
    overlayEl.classList.remove('is-done');
    overlayEl.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    if (titleEl) titleEl.textContent = opts.title || 'Preparing download…';
    if (subEl) subEl.textContent = opts.subtitle || stageFor(0);
    render();
    startSim();
  }

  function set(value, subtitle) {
    ensureDom();
    pct = Math.max(pct, Math.min(99, Number(value) || 0));
    if (subtitle && subEl) subEl.textContent = subtitle;
    render();
  }

  function finish(opts) {
    opts = opts || {};
    ensureDom();
    stopSim();
    pct = 100;
    overlayEl.classList.add('is-done');
    if (titleEl) titleEl.textContent = opts.title || 'Download ready';
    if (subEl) subEl.textContent = opts.subtitle || 'Starting file download…';
    render();
    setTimeout(function () {
      close();
    }, opts.holdMs != null ? opts.holdMs : 650);
  }

  function fail(message) {
    stopSim();
    active = false;
    if (overlayEl) {
      overlayEl.classList.remove('is-open', 'is-done');
    }
    document.body.style.overflow = '';
    if (message) alert(message);
  }

  function close() {
    stopSim();
    active = false;
    pct = 0;
    if (overlayEl) {
      overlayEl.classList.remove('is-open', 'is-done');
    }
    document.body.style.overflow = '';
  }

  function filenameFromDisposition(cd, fallback) {
    if (!cd) return fallback;
    var m = /filename\*?=(?:UTF-8''|")?([^";]+)"?/i.exec(cd);
    if (!m) return fallback;
    try {
      return decodeURIComponent(m[1].replace(/["']/g, '').trim());
    } catch (e) {
      return m[1].replace(/["']/g, '').trim() || fallback;
    }
  }

  function readBlobWithProgress(res) {
    var lenHeader = res.headers.get('Content-Length');
    var total = lenHeader ? parseInt(lenHeader, 10) : 0;
    if (!res.body || !total || !res.body.getReader) {
      return res.blob().then(function (blob) {
        set(96, 'Packaging file…');
        return blob;
      });
    }
    var reader = res.body.getReader();
    var chunks = [];
    var received = 0;
    function pump() {
      return reader.read().then(function (result) {
        if (result.done) {
          var blob = new Blob(chunks);
          set(98, 'Packaging file…');
          return blob;
        }
        chunks.push(result.value);
        received += result.value.length;
        var ratio = received / total;
        set(92 + ratio * 6, 'Downloading file…');
        return pump();
      });
    }
    return pump();
  }

  /**
   * Fetch a download URL with overlay progress, then trigger browser save.
   * @returns {Promise<{blob:Blob,filename:string}>}
   */
  function fetchAndSave(url, opts) {
    opts = opts || {};
    var isPdf = !!opts.isPdf || /format=pdf/i.test(url) || /\.pdf(\?|$)/i.test(url);
    start({
      title: opts.title || (isPdf ? 'Preparing PDF…' : 'Preparing Word…'),
      subtitle: opts.subtitle
    });

    return fetch(url, Object.assign({ credentials: 'same-origin' }, opts.fetchOpts || {}))
      .then(function (res) {
        if (!res.ok) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (j) {
              throw new Error((j && j.message) || 'Download failed (' + res.status + ')');
            });
        }
        set(90, 'Receiving file…');
        var fallback =
          opts.filename ||
          (isPdf ? 'report.pdf' : 'report.docx');
        var fname = filenameFromDisposition(res.headers.get('Content-Disposition'), fallback);
        return readBlobWithProgress(res).then(function (blob) {
          return { blob: blob, filename: fname };
        });
      })
      .then(function (data) {
        finish({ title: 'Download ready', subtitle: 'Saving ' + data.filename });
        var objectUrl = URL.createObjectURL(data.blob);
        var a = document.createElement('a');
        a.href = objectUrl;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch (err) {}
        }, 2000);
        return data;
      })
      .catch(function (err) {
        fail((err && err.message) || 'Download failed. Please try again.');
        throw err;
      });
  }

  /**
   * POST JSON body and save response as file (PRC custom Word download).
   */
  function postAndSave(url, body, opts) {
    opts = opts || {};
    start({
      title: opts.title || 'Preparing Word…',
      subtitle: opts.subtitle
    });
    return fetch(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
      credentials: 'same-origin',
      body: typeof body === 'string' ? body : JSON.stringify(body)
    })
      .then(function (res) {
        if (!res.ok) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (j) {
              throw new Error((j && j.message) || 'Download failed (' + res.status + ')');
            });
        }
        set(90, 'Receiving file…');
        var fallback = opts.filename || 'report.docx';
        var fname = filenameFromDisposition(res.headers.get('Content-Disposition'), fallback);
        return readBlobWithProgress(res).then(function (blob) {
          return { blob: blob, filename: fname };
        });
      })
      .then(function (data) {
        finish({ title: 'Download ready', subtitle: 'Saving ' + data.filename });
        var objectUrl = URL.createObjectURL(data.blob);
        var a = document.createElement('a');
        a.href = objectUrl;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch (err) {}
        }, 2000);
        return data;
      })
      .catch(function (err) {
        fail((err && err.message) || 'Download failed. Please try again.');
        throw err;
      });
  }

  global.FmDownloadProgress = {
    start: start,
    set: set,
    finish: finish,
    fail: fail,
    close: close,
    fetchAndSave: fetchAndSave,
    postAndSave: postAndSave
  };
})(typeof window !== 'undefined' ? window : globalThis);
