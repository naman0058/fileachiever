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

  function bindPrsDownload(el) {
    if (!el || el.__prsDlBound) return;
    el.__prsDlBound = true;
    var idleHtml = el.innerHTML;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      if (el.classList.contains('is-loading')) return;
      var url = el.getAttribute('href');
      if (!url) return;
      var isPdf = /format=pdf/i.test(url);
      el.classList.add('is-loading');
      el.setAttribute('aria-busy', 'true');
      el.innerHTML =
        '<span class="ss-spin" aria-hidden="true"></span> ' +
        (isPdf ? 'Preparing PDF…' : 'Preparing…');

      var run = function () {
        if (window.FmDownloadProgress && typeof window.FmDownloadProgress.fetchAndSave === 'function') {
          return window.FmDownloadProgress.fetchAndSave(url, {
            title: isPdf ? 'Preparing PDF…' : 'Preparing Word…',
            isPdf: isPdf,
            filename: isPdf ? 'report.pdf' : 'report.docx'
          });
        }
        return fetch(url, { credentials: 'same-origin' }).then(function (res) {
          if (!res.ok) throw new Error('Download failed (' + res.status + ')');
          var name = filenameFromDisposition(
            res.headers.get('Content-Disposition'),
            isPdf ? 'report.pdf' : 'report.docx'
          );
          return res.blob().then(function (blob) {
            var objectUrl = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = objectUrl;
            a.download = name;
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
          el.classList.remove('is-loading');
          el.removeAttribute('aria-busy');
          el.innerHTML = idleHtml;
        });
    });
  }

  document.querySelectorAll('a.js-prs-dl').forEach(bindPrsDownload);
})();
