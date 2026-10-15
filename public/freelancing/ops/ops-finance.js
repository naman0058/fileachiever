(function () {
  'use strict';

  var root = document.getElementById('faFinancePage');
  if (!root) return;
  var canMutate = root.getAttribute('data-can-mutate') === '1';

  function idempotencyKey(prefix, leadId) {
    return prefix + '_' + leadId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  async function postPayment(url, body, key) {
    var res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  }

  document.addEventListener('click', async function (e) {
    if (!canMutate) {
      if (e.target.closest('[data-fin-client-pay],[data-fin-agent-pay]') && window.OpsUI) {
        OpsUI.toast('Finance mutations require manager permission', 'error');
      }
      return;
    }

    var clientBtn = e.target.closest('[data-fin-client-pay]');
    if (clientBtn) {
      var cid = clientBtn.getAttribute('data-fin-client-pay');
      var amt = window.prompt('Payment amount (INR, partial allowed):', '');
      if (amt === null) return;
      var ref = window.prompt('Reference (optional):', '') || '';
      var r = await postPayment(
        '/freelancing/api/ops/work/' + cid + '/client-payment',
        { amount: amt, currency: 'INR', reference: ref, payment_date: new Date().toISOString().slice(0, 10) },
        idempotencyKey('cp', cid)
      );
      if (r.status === 403) OpsUI && OpsUI.toast('Unauthorized', 'error');
      else if (r.data.success) location.reload();
      else OpsUI && OpsUI.toast(r.data.message || 'Failed', 'error');
      return;
    }

    var agentBtn = e.target.closest('[data-fin-agent-pay]');
    if (agentBtn) {
      var aid = agentBtn.getAttribute('data-fin-agent-pay');
      var aamt = window.prompt('Agent payment amount (INR):', '');
      if (aamt === null) return;
      var ar = await postPayment(
        '/freelancing/api/ops/work/' + aid + '/agent-payment',
        { amount: aamt, currency: 'INR', payment_date: new Date().toISOString().slice(0, 10) },
        idempotencyKey('ap', aid)
      );
      if (ar.data.success) location.reload();
      else OpsUI && OpsUI.toast(ar.data.message || 'Failed', 'error');
    }
  });
})();
