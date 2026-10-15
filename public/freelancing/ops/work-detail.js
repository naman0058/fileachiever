(function () {
  'use strict';

  var root = document.getElementById('faWorkDetail');
  if (!root) return;

  var workId = root.dataset.workId;
  var opsVersion = root.dataset.opsVersion;

  function versionPayload(extra) {
    var body = extra || {};
    if (opsVersion != null && opsVersion !== '') body.expectedVersion = Number(opsVersion);
    return body;
  }

  function onVersionResult(data) {
    if (data && data.work && data.work.ops_version != null) {
      opsVersion = String(data.work.ops_version);
      root.dataset.opsVersion = opsVersion;
    } else if (data && data.ops_version != null) {
      opsVersion = String(data.ops_version);
      root.dataset.opsVersion = opsVersion;
    }
  }

  async function patchFields(patch, opts) {
    opts = opts || {};
    var body = versionPayload(Object.assign({}, patch));
    if (opts.reason) body.reason = opts.reason;
    if (opts.forceTransition) body.forceTransition = true;

    var res = await fetch('/freelancing/api/ops/work/' + workId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    var data = await res.json();
    if (res.status === 409) {
      if (window.OpsUI) OpsUI.toast(data.message || 'Conflict — refresh the page', 'error');
      return data;
    }
    if (!data.success) {
      if (window.OpsUI) OpsUI.toast(data.message || 'Save failed', 'error');
      return data;
    }
    onVersionResult(data);
    if (window.OpsUI && !opts.silent) OpsUI.toast('Saved', 'success');
    return data;
  }

  function collectFields(selector) {
    var patch = {};
    root.querySelectorAll(selector).forEach(function (node) {
      var field = node.getAttribute('data-wd-field');
      if (field) patch[field] = node.value;
    });
    return patch;
  }

  async function postJson(url, body) {
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return res.json();
  }

  root.addEventListener('click', function (e) {
    if (e.target.closest('[data-wd-resolve-dep]')) {
      var note = window.prompt('Resolution note (internal):', 'Resolved');
      if (note === null) return;
      postJson('/freelancing/api/ops/work/' + workId + '/client-dependency/resolve', { note: note }).then(function (r) {
        if (r.success) location.reload();
        else if (window.OpsUI) OpsUI.toast(r.message || 'Failed', 'error');
      });
      return;
    }
    if (e.target.closest('[data-wd-reopen-dep]')) {
      var cat = window.prompt('Dependency category key (e.g. waiting_files):', 'waiting_files');
      if (!cat) return;
      postJson('/freelancing/api/ops/work/' + workId + '/client-dependency/reopen', {
        client_dependency: cat,
        internal_note: 'Reopened from work detail',
      }).then(function (r) {
        if (r.success) location.reload();
        else if (window.OpsUI) OpsUI.toast(r.message || 'Failed', 'error');
      });
      return;
    }
    if (e.target.closest('[data-wd-client-payment]')) {
      var camt = window.prompt('Client payment INR amount:', '');
      if (camt === null) return;
      postJson('/freelancing/api/ops/work/' + workId + '/client-payment', {
        amount: camt,
        currency: 'INR',
        payment_date: new Date().toISOString().slice(0, 10),
        idempotency_key: 'wd_cp_' + workId + '_' + Date.now(),
      }).then(function (r) {
        if (r.success) location.reload();
        else if (window.OpsUI) OpsUI.toast(r.message || 'Failed', 'error');
      });
      return;
    }
    if (e.target.closest('[data-wd-agent-payment]')) {
      var aamt = window.prompt('Agent payment INR amount:', '');
      if (aamt === null) return;
      postJson('/freelancing/api/ops/work/' + workId + '/agent-payment', {
        amount: aamt,
        currency: 'INR',
        payment_date: new Date().toISOString().slice(0, 10),
        idempotency_key: 'wd_ap_' + workId + '_' + Date.now(),
      }).then(function (r) {
        if (r.success) location.reload();
        else if (window.OpsUI) OpsUI.toast(r.message || 'Failed', 'error');
      });
      return;
    }
    if (e.target.closest('[data-wd-follow-up]')) {
      var outcome = window.prompt('Follow-up outcome (internal):', '');
      if (outcome === null) return;
      postJson('/freelancing/api/ops/work/' + workId + '/follow-up', {
        outcome: outcome,
        internal_note: outcome,
        next_follow_up: root.querySelector('[data-wd-field="follow_up_due"]')?.value || null,
        follow_up_owner: root.querySelector('[data-wd-field="follow_up_owner"]')?.value || null,
        channel: 'internal_note',
      }).then(function (r) {
        if (r.success) location.reload();
        else if (window.OpsUI) OpsUI.toast(r.message || 'Failed', 'error');
      });
      return;
    }

    var btn = e.target.closest('[data-wd-save]');
    if (!btn) return;
    var section = btn.getAttribute('data-wd-save');
    if (section === 'execution') {
      patchFields(collectFields('[data-wd-field]'));
    } else if (section === 'dependencies') {
      patchFields(collectFields('[data-wd-field]'));
    } else if (section === 'delivery') {
      var stageEl = root.querySelector('[data-wd-field="delivery_stage"]');
      var force = root.querySelector('#wd-force-stage');
      var reasonEl = root.querySelector('#wd-stage-reason');
      if (!stageEl) return;
      patchFields({ delivery_stage: stageEl.value }, {
        forceTransition: force && force.checked,
        reason: reasonEl ? reasonEl.value : '',
      }).then(function (r) {
        if (r && r.success && stageEl) stageEl.dataset.prev = stageEl.value;
      });
    }
  });
})();
