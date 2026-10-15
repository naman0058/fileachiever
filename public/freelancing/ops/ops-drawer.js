(function (global) {
  'use strict';

  var metaCache = null;
  var currentId = null;
  var pendingPatch = {};
  var currentOpsVersion = null;
  var lastFocusEl = null;

  function el(id) {
    return document.getElementById(id);
  }

  async function loadMeta() {
    if (metaCache) return metaCache;
    const res = await fetch('/freelancing/api/ops/meta');
    metaCache = await res.json();
    return metaCache;
  }

  function setDrawerOpen(open) {
    var drawer = el('faQuickDrawer');
    if (!drawer) return;
    if (open) {
      lastFocusEl = document.activeElement;
    }
    drawer.hidden = !open;
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.classList.toggle('fa-drawer-open', open);
    if (open) {
      var save = el('faDrawerSave');
      if (save) save.focus();
    } else if (lastFocusEl && lastFocusEl.focus) {
      lastFocusEl.focus();
      lastFocusEl = null;
    }
  }

  function buildForm(work, meta) {
    var html = '';
    html += '<p class="fa-text-sm"><strong>#' + work.id + '</strong> ' + (work.enquiry || '') + '</p>';
    html += fieldSelect('priority', 'Priority', meta.priorities, work.priority_effective || work.priority || 'medium');
    html += fieldText('assign', 'Assign agent', work.assign || '');
    html += fieldDate('deadline', 'Deadline', work.deadline ? String(work.deadline).slice(0, 10) : '');
    if (meta.hasOps) {
      html += fieldSelect('delivery_stage', 'Delivery stage', meta.stages, work.delivery_stage_effective || work.delivery_stage || '');
      html += fieldSelect(
        'client_dependency',
        'Client dependency',
        meta.clientDependencies,
        work.client_dependency || 'none'
      );
      html += fieldText('blocker_reason', 'Blocker', work.blocker_reason || '');
      html += fieldDate('follow_up_due', 'Follow-up due', work.follow_up_due ? String(work.follow_up_due).slice(0, 10) : '');
    }
    html += fieldTextarea('remarks', 'Notes / description', work.remarks || '');
    return html;
  }

  function fieldText(name, label, value, type) {
    type = type || 'text';
    return (
      '<div class="fa-drawer__field"><label for="fd-' +
      name +
      '">' +
      label +
      '</label><input class="fa-input" id="fd-' +
      name +
      '" data-field="' +
      name +
      '" type="' +
      type +
      '" value="' +
      escapeAttr(value) +
      '" autocomplete="off" /></div>'
    );
  }

  function fieldDate(name, label, value) {
    return (
      '<div class="fa-drawer__field fa-drawer__field--date"><label for="fd-' +
      name +
      '">' +
      label +
      '</label><div class="fa-drawer-date-wrap"><input class="fa-input fa-drawer-date" id="fd-' +
      name +
      '" data-field="' +
      name +
      '" type="date" value="' +
      escapeAttr(value) +
      '" autocomplete="off" /></div></div>'
    );
  }

  function fieldTextarea(name, label, value) {
    return (
      '<div class="fa-drawer__field"><label for="fd-' +
      name +
      '">' +
      label +
      '</label><textarea class="fa-input" id="fd-' +
      name +
      '" data-field="' +
      name +
      '" rows="3">' +
      escapeHtml(value) +
      '</textarea></div>'
    );
  }

  function fieldSelect(name, label, options, value) {
    var opts = (options || [])
      .map(function (o) {
        var sel = String(o) === String(value) ? ' selected' : '';
        return '<option value="' + escapeAttr(o) + '"' + sel + '>' + escapeHtml(String(o).replace(/_/g, ' ')) + '</option>';
      })
      .join('');
    return (
      '<div class="fa-drawer__field"><label for="fd-' +
      name +
      '">' +
      label +
      '</label><select class="fa-select fa-drawer-native-select" id="fd-' +
      name +
      '" data-field="' +
      name +
      '" data-fa-no-selectpicker="1">' +
      opts +
      '</select></div>'
    );
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function escapeHtml(s) {
    return escapeAttr(s);
  }

  function sanitizeDrawerFields(root) {
    if (!root) return;
    root.querySelectorAll('select.fa-select').forEach(function (sel) {
      if (global.jQuery && global.jQuery.fn.selectpicker) {
        var $s = global.jQuery(sel);
        try {
          if ($s.data('selectpicker')) $s.selectpicker('destroy');
        } catch (_) {}
      }
      sel.classList.remove('default-select');
    });
    root.querySelectorAll('.fa-drawer-date').forEach(function (inp) {
      if (inp.value && inp.value.length > 10) inp.value = inp.value.slice(0, 10);
    });
  }

  function collectPatch() {
    var patch = {};
    el('faDrawerBody')
      .querySelectorAll('[data-field]')
      .forEach(function (node) {
        patch[node.getAttribute('data-field')] = node.value;
      });
    return patch;
  }

  async function openQuickEdit(id) {
    currentId = id;
    pendingPatch = {};
    el('faDrawerTitle').textContent = 'Quick edit · #' + id;
    el('faDrawerOpenFull').href = '/freelancing/work/' + id;
    el('faDrawerBody').innerHTML = '<p class="text-muted">Loading…</p>';
    el('faDrawerSave').disabled = true;
    setDrawerOpen(true);

    try {
      const [metaRes, workRes] = await Promise.all([
        loadMeta(),
        fetch('/freelancing/api/ops/work/' + id).then(function (r) {
          return r.json();
        }),
      ]);
      if (!workRes.success || !workRes.work) throw new Error('Not found');
      currentOpsVersion =
        workRes.work.ops_version != null ? Number(workRes.work.ops_version) : null;
      el('faDrawerBody').innerHTML = buildForm(workRes.work, metaRes);
      sanitizeDrawerFields(el('faDrawerBody'));
      el('faDrawerSave').disabled = false;
    } catch (e) {
      el('faDrawerBody').innerHTML = '<p class="fa-error__text">Failed to load work #' + id + '.</p>';
      if (global.OpsUI) OpsUI.toast('Could not load work', 'error');
    }
  }

  async function saveDrawer() {
    if (!currentId) return;
    var btn = el('faDrawerSave');
    var patch = collectPatch();
    btn.classList.add('is-loading');
    btn.disabled = true;
    try {
      if (currentOpsVersion != null) patch.expectedVersion = currentOpsVersion;
      const res = await fetch('/freelancing/api/ops/work/' + currentId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!data.success) {
        if (res.status === 409 && global.OpsUI) {
          OpsUI.toast(data.message || 'Conflict — reopen quick edit', 'error');
        } else if (global.OpsUI) OpsUI.toast(data.message || 'Save failed', 'error');
        btn.disabled = false;
        return;
      }
      if (data.work && data.work.ops_version != null) {
        currentOpsVersion = Number(data.work.ops_version);
      } else if (data.ops_version != null) {
        currentOpsVersion = Number(data.ops_version);
      }
      if (global.OpsUI) OpsUI.toast('Changes saved', 'success');
      setDrawerOpen(false);
      document.dispatchEvent(new CustomEvent('fa:work-updated', { detail: { id: currentId } }));
    } catch (_) {
      if (global.OpsUI) OpsUI.toast('Save failed', 'error');
    } finally {
      btn.classList.remove('is-loading');
      btn.disabled = false;
    }
  }

  function init() {
    var closeBtn = el('faDrawerClose');
    var backdrop = el('faDrawerBackdrop');
    var saveBtn = el('faDrawerSave');
    if (closeBtn) closeBtn.addEventListener('click', function () {
      setDrawerOpen(false);
    });
    if (backdrop) backdrop.addEventListener('click', function () {
      setDrawerOpen(false);
    });
    if (saveBtn) saveBtn.addEventListener('click', saveDrawer);

    document.addEventListener('keydown', function (e) {
      var drawer = el('faQuickDrawer');
      if (!drawer || drawer.hidden) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setDrawerOpen(false);
      }
    });

    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-fa-quick-edit]');
      if (t) {
        e.preventDefault();
        openQuickEdit(t.getAttribute('data-fa-quick-edit'));
      }
    });
  }

  global.FaDrawer = { open: openQuickEdit, close: function () {
    setDrawerOpen(false);
  } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
