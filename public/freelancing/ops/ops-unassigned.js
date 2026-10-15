(function () {
  'use strict';

  var table = document.querySelector('[data-fa-unassigned-table]');
  if (!table) return;

  async function assignOne(id, assign, note) {
    var res = await fetch('/freelancing/api/ops/work/' + id + '/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assign: assign, note: note || '' }),
    });
    return res.json();
  }

  table.querySelectorAll('[data-suggest-for]').forEach(function (cell) {
    var id = cell.getAttribute('data-suggest-for');
    fetch('/freelancing/api/ops/workload/suggest/' + id)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.success || !(data.suggestions || []).length) {
          cell.textContent = '—';
          return;
        }
        var top = data.suggestions[0];
        cell.innerHTML =
          '<strong>' +
          top.agent_name +
          '</strong> <span class="fa-text-sm text-muted">#' +
          top.rank +
          ' · ' +
          (top.projected_utilization_pct != null ? top.projected_utilization_pct + '% proj.' : top.load_status) +
          '</span>';
        var sel = table.querySelector('[data-assign-select][data-id="' + id + '"]');
        if (sel && top.agent_name) sel.value = top.agent_name;
      })
      .catch(function () {
        cell.textContent = '—';
      });
  });

  table.addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-assign-go]');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    var sel = table.querySelector('[data-assign-select][data-id="' + id + '"]');
    var assign = sel ? sel.value : '';
    if (!assign) {
      if (window.OpsUI) OpsUI.toast('Select an agent', 'error');
      return;
    }
    var note = window.prompt('Assignment note (optional, internal audit):', '') || '';
    var r = await assignOne(id, assign, note);
    if (r.success) location.reload();
    else if (window.OpsUI) OpsUI.toast(r.message || 'Assign failed', 'error');
  });

  var bulkApply = document.getElementById('faUnassignedBulkApply');
  if (bulkApply) {
    bulkApply.addEventListener('click', async function () {
      var ids = Array.prototype.slice
        .call(table.querySelectorAll('.fa-unassigned-check:checked'))
        .map(function (c) {
          return Number(c.value);
        });
      var assign = document.getElementById('faUnassignedBulkAgent').value;
      var note = document.getElementById('faUnassignedBulkNote').value;
      if (!ids.length || !assign) {
        if (window.OpsUI) OpsUI.toast('Select rows and agent', 'error');
        return;
      }
      var res = await fetch('/freelancing/api/ops/work/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids, assign: assign, note: note }),
      });
      var data = await res.json();
      if (data.succeeded > 0) location.reload();
      else if (window.OpsUI) OpsUI.toast(data.message || 'Bulk assign failed', 'error');
    });
  }

  var selectAll = document.getElementById('faUnassignedAll');
  if (selectAll) {
    selectAll.addEventListener('change', function () {
      table.querySelectorAll('.fa-unassigned-check').forEach(function (c) {
        c.checked = selectAll.checked;
      });
    });
  }
})();
