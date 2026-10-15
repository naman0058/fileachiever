(function () {
  'use strict';

  var root = document.getElementById('faClientPendingPage');
  if (!root) return;

  async function postJson(url, body) {
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return res.json();
  }

  root.addEventListener('click', async function (e) {
    var resolveBtn = e.target.closest('[data-fa-client-resolve]');
    if (resolveBtn) {
      var id = resolveBtn.getAttribute('data-fa-client-resolve');
      var note = window.prompt('Resolution note (internal — not sent to client):', 'Client provided required input');
      if (note === null) return;
      var r = await postJson('/freelancing/api/ops/work/' + id + '/client-dependency/resolve', { note: note });
      if (r.success) {
        if (window.OpsUI) OpsUI.toast('Dependency resolved', 'success');
        location.reload();
      } else if (window.OpsUI) OpsUI.toast(r.message || 'Failed', 'error');
      return;
    }

    var followBtn = e.target.closest('[data-fa-client-follow]');
    if (followBtn) {
      var wid = followBtn.getAttribute('data-fa-client-follow');
      var outcome = window.prompt('Follow-up outcome (internal record only):', 'Called / messaged client');
      if (outcome === null) return;
      var next = window.prompt('Next follow-up date (YYYY-MM-DD, optional):', '');
      var owner = window.prompt('Follow-up owner (optional):', '');
      var body = { outcome: outcome, channel: 'internal_note' };
      if (next) body.next_follow_up = next;
      if (owner) body.follow_up_owner = owner;
      var fr = await postJson('/freelancing/api/ops/work/' + wid + '/follow-up', body);
      if (fr.success) {
        if (window.OpsUI) OpsUI.toast('Follow-up recorded', 'success');
        location.reload();
      } else if (window.OpsUI) OpsUI.toast(fr.message || 'Failed', 'error');
    }
  });
})();
