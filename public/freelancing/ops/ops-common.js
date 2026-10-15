(function () {
  window.opsPatchField = async function (id, field, value, options) {
    options = options || {};
    const body = { field, value };
    if (options.expectedVersion != null) body.expectedVersion = options.expectedVersion;
    if (options.reason) body.reason = options.reason;
    if (options.forceTransition) body.forceTransition = true;
    const res = await fetch('/freelancing/api/ops/work/' + id + '/field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.status === 409 && window.OpsUI) OpsUI.toast(data.message || 'Conflict — refresh', 'error');
    else if (data.success && window.OpsUI && !options.silent) OpsUI.toast('Saved', 'success');
    else if (!data.success && window.OpsUI) OpsUI.toast(data.message || 'Update failed', 'error');
    return data;
  };

  window.opsChangeStage = async function (id, stage, selectEl) {
    const ok =
      window.OpsUI &&
      (await OpsUI.confirm(
        'Change delivery stage',
        'Move work #' + id + ' to “' + stage.replace(/_/g, ' ') + '”?'
      ));
    if (!ok) {
      if (selectEl) selectEl.value = selectEl.dataset.prev || '';
      return;
    }
    const r = await opsPatchField(id, 'delivery_stage', stage);
    if (!r.success) {
      if (selectEl) selectEl.value = selectEl.dataset.prev || '';
    } else if (selectEl) {
      selectEl.dataset.prev = stage;
    }
  };

  document.addEventListener('change', function (e) {
    const sel = e.target;
    if (sel.matches('[data-ops-stage]')) {
      opsChangeStage(sel.dataset.id, sel.value, sel);
    }
    if (sel.matches('[data-ops-priority]')) {
      opsPatchField(sel.dataset.id, 'priority', sel.value);
    }
  });
})();
