(function () {
  'use strict';

  var PREFS_KEY = 'fa_ops_prefs_v1';
  var root = document.getElementById('faDeliveryPage');
  if (!root) return;

  var dragId = null;

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

  function persistModeLinks() {
    var mode = root.getAttribute('data-delivery-mode') || 'kanban';
    var prefs = readPrefs();
    prefs.deliveryView = mode;
    writePrefs(prefs);
    document.querySelectorAll('[data-fa-delivery-mode]').forEach(function (a) {
      a.addEventListener('click', function () {
        var m = a.getAttribute('data-fa-delivery-mode');
        var p = readPrefs();
        p.deliveryView = m;
        writePrefs(p);
      });
    });
  }

  (function applySavedView() {
    var params = new URLSearchParams(location.search);
    if (!params.has('mode')) {
      var prefs = readPrefs();
      if (prefs.deliveryView && prefs.deliveryView !== 'kanban') {
        params.set('mode', prefs.deliveryView);
        location.replace(location.pathname + '?' + params.toString());
      }
    }
  })();

  async function moveStage(id, stage, prevEl, extra) {
    extra = extra || {};
    var res = await fetch('/freelancing/api/ops/work/' + id + '/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage: stage,
        reason: extra.reason || '',
        revisionReason: extra.revisionReason || '',
        forceTransition: extra.forceTransition || false,
      }),
    });
    var data = await res.json();
    if (!data.success) {
      if (window.OpsUI) OpsUI.toast(data.message || 'Stage change blocked', 'error');
      if (prevEl && prevEl.dataset) prevEl.value = prevEl.dataset.prev || '';
      return false;
    }
    if (prevEl && prevEl.dataset) prevEl.dataset.prev = stage;
    if (window.OpsUI) OpsUI.toast('Stage updated', 'success');
    return true;
  }

  document.addEventListener('change', function (e) {
    var sel = e.target.closest('[data-kanban-move]');
    if (!sel) return;
    var id = sel.getAttribute('data-id');
    var stage = sel.value;
    if (stage === 'revision_required') {
      var reason = window.prompt('Revision reason (required for audit):', '');
      if (reason === null) {
        sel.value = sel.dataset.prev || '';
        return;
      }
      moveStage(id, stage, sel, { revisionReason: reason, reason: reason }).then(function (ok) {
        if (ok) location.reload();
      });
      return;
    }
    moveStage(id, stage, sel).then(function (ok) {
      if (ok) location.reload();
    });
  });

  var kanban = document.querySelector('[data-fa-kanban]');
  if (kanban) {
    kanban.addEventListener('dragstart', function (e) {
      var card = e.target.closest('.fa-kanban-card');
      if (!card) return;
      dragId = card.getAttribute('data-work-id');
      card.classList.add('is-dragging');
      e.dataTransfer.setData('text/plain', dragId);
    });

    kanban.addEventListener('dragend', function (e) {
      var card = e.target.closest('.fa-kanban-card');
      if (card) card.classList.remove('is-dragging');
      dragId = null;
    });

    kanban.querySelectorAll('[data-drop-stage]').forEach(function (zone) {
      zone.addEventListener('dragover', function (e) {
        e.preventDefault();
        zone.classList.add('is-drag-over');
      });
      zone.addEventListener('dragleave', function () {
        zone.classList.remove('is-drag-over');
      });
      zone.addEventListener('drop', async function (e) {
        e.preventDefault();
        zone.classList.remove('is-drag-over');
        var id = e.dataTransfer.getData('text/plain') || dragId;
        var toStage = zone.getAttribute('data-drop-stage');
        if (!id || !toStage) return;
        var extra = {};
        if (toStage === 'revision_required') {
          var reason = window.prompt('Revision reason:', '');
          if (!reason) return;
          extra.revisionReason = reason;
          extra.reason = reason;
        }
        var ok = await moveStage(id, toStage, null, extra);
        if (ok) location.reload();
      });
    });
  }

  persistModeLinks();
})();
