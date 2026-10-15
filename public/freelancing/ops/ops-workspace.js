(function (global) {
  'use strict';

  var PREFS_KEY = 'fa_ops_prefs_v1';
  var VIEWS_KEY = 'fa_ops_saved_views_v1';
  var searchTimer = null;
  var searchItems = [];
  var searchIndex = -1;

  var BUILTIN_VIEWS = [
    { id: 'urgent', name: 'Critical queue', path: '/freelancing/priority', query: { view: 'critical' } },
    { id: 'attention', name: 'Needs attention', path: '/freelancing/priority', query: { view: 'attention' } },
    { id: 'overdue', name: 'Overdue deliveries', path: '/freelancing/priority', query: { view: 'overdue' } },
    { id: 'mine', name: 'My assigned work', path: '/freelancing/priority', query: { view: 'mine' } },
    { id: 'client', name: 'Waiting for client', path: '/freelancing/client-pending', query: {} },
    { id: 'payment', name: 'Payment pending', path: '/freelancing/finance', query: {} },
    { id: 'deadlines', name: 'Deadline calendar list', path: '/freelancing/deadlines', query: {} },
  ];

  function el(id) {
    return document.getElementById(id);
  }

  function readPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function writePrefs(p) {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  }

  function readViews() {
    try {
      var custom = JSON.parse(localStorage.getItem(VIEWS_KEY) || '[]');
      return BUILTIN_VIEWS.concat(custom);
    } catch (_) {
      return BUILTIN_VIEWS.slice();
    }
  }

  function saveCustomView(name, url) {
    var custom = [];
    try {
      custom = JSON.parse(localStorage.getItem(VIEWS_KEY) || '[]');
    } catch (_) {}
    custom.push({ id: 'c_' + Date.now(), name: name, path: url.pathname, query: Object.fromEntries(url.searchParams) });
    localStorage.setItem(VIEWS_KEY, JSON.stringify(custom));
  }

  function applySidebarPref() {
    var prefs = readPrefs();
    if (prefs.sidebarCollapsed) document.body.classList.add('fa-sidebar-collapsed');
  }

  function toggleSidebar() {
    document.body.classList.toggle('fa-sidebar-collapsed');
    var prefs = readPrefs();
    prefs.sidebarCollapsed = document.body.classList.contains('fa-sidebar-collapsed');
    writePrefs(prefs);
    var btn = el('faSidebarToggle');
    if (btn) btn.setAttribute('aria-pressed', prefs.sidebarCollapsed ? 'true' : 'false');
  }

  function applyDensity() {
    var prefs = readPrefs();
    document.querySelectorAll('.fa-table').forEach(function (t) {
      t.classList.toggle('fa-table--compact', prefs.density === 'compact');
    });
    var dens = document.querySelector('[name="density"]');
    if (dens && prefs.density) dens.value = prefs.density;
  }

  function persistPageSizeFromForm() {
    var sel = document.querySelector('[name="limit"]');
    if (!sel) return;
    var prefs = readPrefs();
    prefs.pageSize = sel.value;
    writePrefs(prefs);
  }

  function applyPageSizeDefault() {
    var prefs = readPrefs();
    var sel = document.querySelector('[name="limit"]');
    if (sel && prefs.pageSize && !new URLSearchParams(location.search).has('limit')) {
      sel.value = prefs.pageSize;
    }
  }

  function populateSavedViews() {
    var select = el('faSavedViewSelect');
    if (!select) return;
    var views = readViews();
    views.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.name;
      select.appendChild(opt);
    });
    select.addEventListener('change', function () {
      var id = select.value;
      if (!id) return;
      var v = views.find(function (x) {
        return x.id === id;
      });
      if (!v) return;
      var qs = new URLSearchParams(v.query || {}).toString();
      location.href = v.path + (qs ? '?' + qs : '');
    });
  }

  function openSearchModal() {
    var modal = el('faSearchModal');
    if (!modal) return;
    modal.hidden = false;
    var input = el('faSearchModalInput');
    if (input) {
      input.value = el('faGlobalSearchInput') ? el('faGlobalSearchInput').value : '';
      input.focus();
      runSearch(input.value);
    }
  }

  function closeSearchModal() {
    var modal = el('faSearchModal');
    if (modal) modal.hidden = true;
    searchItems = [];
    searchIndex = -1;
  }

  function renderSearchResults(data) {
    var box = el('faSearchResults');
    if (!box) return;
    searchItems = [];
    if (!data.groups || !data.groups.length) {
      box.innerHTML = '<p class="fa-search-hint">No matches.</p>';
      return;
    }
    var html = '';
    data.groups.forEach(function (g) {
      html += '<div class="fa-search-group"><div class="fa-search-group__title">' + g.label + '</div>';
      g.items.forEach(function (it) {
        searchItems.push(it);
        html +=
          '<button type="button" class="fa-search-item" data-id="' +
          it.id +
          '"><strong>#' +
          it.id +
          '</strong> ' +
          (it.enquiry || it.name || '') +
          '<div class="fa-search-item__meta">' +
          (it.name || '') +
          (it.assign ? ' · ' + it.assign : '') +
          '</div></button>';
      });
      html += '</div>';
    });
    box.innerHTML = html;
    box.querySelectorAll('.fa-search-item').forEach(function (btn, idx) {
      btn.addEventListener('click', function () {
        navigateToWork(btn.getAttribute('data-id'));
      });
      if (idx === 0) highlightSearch(0);
    });
  }

  function highlightSearch(idx) {
    searchIndex = idx;
    el('faSearchResults').querySelectorAll('.fa-search-item').forEach(function (b, i) {
      b.classList.toggle('is-active', i === idx);
    });
  }

  function navigateToWork(id) {
    closeSearchModal();
    location.href = '/freelancing/work/' + id;
  }

  function runSearch(q) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async function () {
      var term = (q || '').trim();
      if (term.length < 1) {
        if (el('faSearchResults')) el('faSearchResults').innerHTML = '';
        return;
      }
      try {
        const res = await fetch('/freelancing/api/ops/search?q=' + encodeURIComponent(term));
        const data = await res.json();
        if (data.success) renderSearchResults(data);
      } catch (_) {
        if (global.OpsUI) OpsUI.toast('Search failed', 'error');
      }
    }, 280);
  }

  function initSearch() {
    var top = el('faGlobalSearchInput');
    var modalInput = el('faSearchModalInput');
    var close = el('faSearchClose');

    if (top) {
      top.addEventListener('focus', openSearchModal);
      top.addEventListener('input', function () {
        if (modalInput) modalInput.value = top.value;
        runSearch(top.value);
      });
    }
    if (modalInput) {
      modalInput.addEventListener('input', function () {
        if (top) top.value = modalInput.value;
        runSearch(modalInput.value);
      });
      modalInput.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          highlightSearch(Math.min(searchItems.length - 1, searchIndex + 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          highlightSearch(Math.max(0, searchIndex - 1));
        } else if (e.key === 'Enter' && searchIndex >= 0 && searchItems[searchIndex]) {
          e.preventDefault();
          navigateToWork(searchItems[searchIndex].id);
        }
      });
    }
    if (close) close.addEventListener('click', closeSearchModal);
    el('faSearchModal') &&
      el('faSearchModal').addEventListener('click', function (e) {
        if (e.target.id === 'faSearchModal') closeSearchModal();
      });
  }

  function initKeyboard() {
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      var inField = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

      if (e.key === 'Escape') {
        closeSearchModal();
        if (global.FaDrawer) FaDrawer.close();
        return;
      }

      if (!inField && e.key === '/') {
        e.preventDefault();
        openSearchModal();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearchModal();
        return;
      }

      if (!inField && e.key === 'Enter' && document.querySelector('.fa-table tbody tr.fa-row-focus')) {
        var row = document.querySelector('.fa-table tbody tr.fa-row-focus');
        var link = row.querySelector('a[href*="/freelancing/work/"]');
        if (link) {
          e.preventDefault();
          link.click();
        }
      }
    });

    var rowIdx = -1;
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var rows = Array.prototype.slice.call(document.querySelectorAll('.fa-table tbody tr[data-fa-row]'));
      if (!rows.length) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      e.preventDefault();
      if (e.key === 'ArrowDown') rowIdx = Math.min(rows.length - 1, rowIdx + 1);
      else rowIdx = Math.max(0, rowIdx - 1);
      rows.forEach(function (r, i) {
        r.classList.toggle('fa-row-focus', i === rowIdx);
      });
      if (rows[rowIdx]) rows[rowIdx].scrollIntoView({ block: 'nearest' });
    });
  }

  function initSavedViews() {
    populateSavedViews();
    var saveBtn = el('faSaveViewBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var name = prompt('Name this view (saved on this device only):');
        if (!name) return;
        saveCustomView(name, new URL(location.href));
        if (global.OpsUI) OpsUI.toast('View saved', 'success');
        location.reload();
      });
    }
  }

  function init() {
    applySidebarPref();
    applyDensity();
    applyPageSizeDefault();
    var toggle = el('faSidebarToggle');
    if (toggle) toggle.addEventListener('click', toggleSidebar);
    document.querySelectorAll('.fa-filter').forEach(function (f) {
      f.addEventListener('submit', persistPageSizeFromForm);
    });
    var dens = document.querySelector('[name="density"]');
    if (dens) {
      dens.addEventListener('change', function () {
        var prefs = readPrefs();
        prefs.density = dens.value;
        writePrefs(prefs);
        applyDensity();
      });
    }
    initSearch();
    initKeyboard();
    initSavedViews();

    document.addEventListener('fa:work-updated', function () {
      if (document.querySelector('.fa-table-wrap')) location.reload();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
