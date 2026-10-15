(function () {
  'use strict';

  var table = document.querySelector('[data-fa-priority-table]');
  if (!table) return;

  var bulkBar = document.getElementById('faBulkBar');
  var bulkCount = document.getElementById('faBulkCount');
  var selectAll = document.getElementById('faSelectAll');
  var bulkAction = document.getElementById('faBulkAction');
  var bulkValue = document.getElementById('faBulkValue');
  var bulkPriority = document.getElementById('faBulkPriority');
  var bulkDeadline = document.getElementById('faBulkDeadline');
  var bulkApply = document.getElementById('faBulkApply');
  var bulkClear = document.getElementById('faBulkClear');

  function selectedIds() {
    return Array.prototype.slice
      .call(table.querySelectorAll('.fa-row-check:checked'))
      .map(function (c) {
        return Number(c.value);
      });
  }

  function refreshBulkBar() {
    var ids = selectedIds();
    if (bulkBar) bulkBar.hidden = ids.length === 0;
    if (bulkCount) bulkCount.textContent = ids.length + ' item' + (ids.length === 1 ? '' : 's') + ' selected';
    if (selectAll) {
      var checks = table.querySelectorAll('.fa-row-check');
      selectAll.checked = checks.length > 0 && ids.length === checks.length;
      selectAll.indeterminate = ids.length > 0 && ids.length < checks.length;
    }
  }

  function hideBulkInputs() {
    if (bulkValue) bulkValue.hidden = true;
    if (bulkPriority) bulkPriority.hidden = true;
    if (bulkDeadline) bulkDeadline.hidden = true;
  }

  function onBulkActionChange() {
    hideBulkInputs();
    var v = bulkAction ? bulkAction.value : '';
    if (v === 'assign' || v === 'blocker') {
      if (bulkValue) {
        bulkValue.hidden = false;
        bulkValue.placeholder = v === 'assign' ? 'Agent name' : 'Blocker text';
      }
    } else if (v === 'priority' && bulkPriority) {
      bulkPriority.hidden = false;
    } else if (v === 'deadline' && bulkDeadline) {
      bulkDeadline.hidden = false;
    }
  }

  async function applyBulk() {
    var ids = selectedIds();
    if (!ids.length) return;
    var action = bulkAction ? bulkAction.value : '';
    if (!action) {
      if (window.OpsUI) OpsUI.toast('Choose a bulk action', 'error');
      return;
    }
    var patch = {};
    if (action === 'assign') patch.assign = bulkValue ? bulkValue.value : '';
    else if (action === 'priority') patch.priority = bulkPriority ? bulkPriority.value : 'medium';
    else if (action === 'deadline') patch.deadline = bulkDeadline ? bulkDeadline.value : '';
    else if (action === 'blocker') patch.blocker_reason = bulkValue ? bulkValue.value : '';
    else if (action === 'clear_blocker') patch.blocker_reason = '';

    if (bulkApply) bulkApply.disabled = true;
    try {
      var res = await fetch('/freelancing/api/ops/work/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids, patch: patch, reason: 'Bulk update from priority queue' }),
      });
      var data = await res.json();
      if (data.succeeded > 0 && window.OpsUI) {
        OpsUI.toast('Updated ' + data.succeeded + ' of ' + data.total, data.failed ? 'warning' : 'success');
      } else if (window.OpsUI) {
        OpsUI.toast(data.message || 'Bulk update failed', 'error');
      }
      if (data.succeeded > 0) location.reload();
    } catch (_) {
      if (window.OpsUI) OpsUI.toast('Bulk update failed', 'error');
    } finally {
      if (bulkApply) bulkApply.disabled = false;
    }
  }

  table.addEventListener('change', function (e) {
    if (e.target.matches('.fa-row-check')) refreshBulkBar();
  });

  if (selectAll) {
    selectAll.addEventListener('change', function () {
      var on = selectAll.checked;
      table.querySelectorAll('.fa-row-check').forEach(function (c) {
        c.checked = on;
      });
      refreshBulkBar();
    });
  }

  if (bulkAction) bulkAction.addEventListener('change', onBulkActionChange);
  if (bulkApply) bulkApply.addEventListener('click', applyBulk);
  if (bulkClear) {
    bulkClear.addEventListener('click', function () {
      table.querySelectorAll('.fa-row-check').forEach(function (c) {
        c.checked = false;
      });
      refreshBulkBar();
    });
  }

  document.addEventListener('fa:work-updated', function () {
    location.reload();
  });

  var exportBtn = document.getElementById('faPriorityExport');
  if (exportBtn) {
    exportBtn.addEventListener('click', async function () {
      exportBtn.disabled = true;
      try {
        var params = new URLSearchParams(window.location.search);
        params.set('limit', '200');
        params.set('page', '1');
        if (!params.has('view') && params.get('view') !== '') {
          /* keep view from URL */
        }
        var res = await fetch('/freelancing/api/ops/work?' + params.toString());
        var data = await res.json();
        if (!data.success || !data.items) {
          if (window.OpsUI) OpsUI.toast('Export failed', 'error');
          return;
        }
        var lines = ['id,project,client,assign,priority,stage,deadline,blocker'];
        data.items.forEach(function (row) {
          function esc(v) {
            var s = v == null ? '' : String(v);
            if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
            return s;
          }
          lines.push(
            [
              row.id,
              row.enquiry,
              row.name,
              row.assign,
              row.priority_effective || row.priority,
              row.delivery_stage_effective || row.delivery_stage,
              row.deadline,
              row.blocker_reason,
            ]
              .map(esc)
              .join(',')
          );
        });
        var blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'priority-queue-export.csv';
        a.click();
        URL.revokeObjectURL(a.href);
        if (window.OpsUI) OpsUI.toast('Exported ' + data.items.length + ' rows', 'success');
      } catch (_) {
        if (window.OpsUI) OpsUI.toast('Export failed', 'error');
      } finally {
        exportBtn.disabled = false;
      }
    });
  }

  var bulkTrigger = document.getElementById('faPriorityBulkTrigger');
  if (bulkTrigger && bulkBar) {
    bulkTrigger.addEventListener('click', function () {
      var first = table.querySelector('.fa-row-check');
      if (first && bulkBar.hidden) {
        first.focus();
        if (window.OpsUI) OpsUI.toast('Select rows, then use the bulk bar below the toolbar', 'info');
      } else if (!bulkBar.hidden) {
        bulkBar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }
})();
