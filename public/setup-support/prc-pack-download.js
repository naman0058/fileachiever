(function () {
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

  function bindPackDownload(btn) {
    if (!btn || btn.__prcPackBound) return;
    btn.__prcPackBound = true;
    var idleHtml = btn.innerHTML;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (btn.classList.contains('is-loading')) return;
      var id = btn.getAttribute('data-id');
      var plan = btn.getAttribute('data-plan') || 'synopsis';
      var format = btn.getAttribute('data-format') || 'docx';
      var name = btn.getAttribute('data-name') || 'Report';
      if (!id) return;

      var url =
        '/project-report-creator/api/source-code/' +
        encodeURIComponent(id) +
        '/download-pack?plan=' +
        encodeURIComponent(plan) +
        '&format=' +
        encodeURIComponent(format);

      var fallback =
        (name || 'Report').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') +
        (plan === 'synopsis' ? '_Synopsis' : '_Report') +
        (format === 'pdf' ? '.pdf' : '.docx');

      var label =
        plan === 'synopsis'
          ? format === 'pdf'
            ? 'Preparing Synopsis PDF…'
            : 'Preparing Synopsis Word…'
          : format === 'pdf'
            ? 'Preparing Pre Defined PDF…'
            : 'Preparing Pre Defined Word…';

      btn.classList.add('is-loading');
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      btn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' +
        (format === 'pdf' ? 'Preparing PDF…' : 'Preparing…');

      var run = function () {
        if (window.FmDownloadProgress && typeof window.FmDownloadProgress.fetchAndSave === 'function') {
          return window.FmDownloadProgress.fetchAndSave(url, {
            title: label,
            isPdf: format === 'pdf',
            filename: fallback
          });
        }
        return fetch(url, { credentials: 'same-origin' }).then(function (res) {
          if (!res.ok) {
            return res
              .json()
              .catch(function () {
                return {};
              })
              .then(function (j) {
                throw new Error(j.message || 'Download failed (' + res.status + ')');
              });
          }
          var fname = filenameFromDisposition(res.headers.get('Content-Disposition'), fallback);
          return res.blob().then(function (blob) {
            var objectUrl = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = objectUrl;
            a.download = fname;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () {
              try {
                URL.revokeObjectURL(objectUrl);
              } catch (err) {}
            }, 2000);
          });
        });
      };

      run()
        .catch(function (err) {
          if (!(window.FmDownloadProgress && err)) {
            alert((err && err.message) || 'Download failed. Please try again.');
          }
        })
        .finally(function () {
          btn.classList.remove('is-loading');
          btn.removeAttribute('aria-busy');
          btn.disabled = false;
          btn.innerHTML = idleHtml;
        });
    });
  }

  document.querySelectorAll('.js-prc-pack-dl').forEach(bindPackDownload);
})();
