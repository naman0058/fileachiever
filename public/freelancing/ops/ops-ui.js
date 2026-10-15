(function (global) {
  'use strict';

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function toast(message, type) {
    var host = qs('#faToastHost');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'fa-toast' + (type === 'success' ? ' fa-toast--success' : type === 'error' ? ' fa-toast--error' : '');
    el.setAttribute('role', 'status');
    el.textContent = message;
    host.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 4200);
  }

  function confirmDialog(title, body) {
    return new Promise(function (resolve) {
      var backdrop = document.createElement('div');
      backdrop.className = 'fa-modal-backdrop';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.innerHTML =
        '<div class="fa-modal">' +
        '<div class="fa-modal__head">' +
        (title || 'Confirm') +
        '</div>' +
        '<div class="fa-modal__body">' +
        (body || '') +
        '</div>' +
        '<div class="fa-modal__foot">' +
        '<button type="button" class="fa-btn fa-btn--ghost" data-fa-cancel>Cancel</button>' +
        '<button type="button" class="fa-btn fa-btn--primary" data-fa-ok>Confirm</button>' +
        '</div></div>';

      function cleanup(result) {
        backdrop.remove();
        document.removeEventListener('keydown', onKey);
        resolve(result);
      }

      function onKey(e) {
        if (e.key === 'Escape') cleanup(false);
      }

      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) cleanup(false);
      });
      backdrop.querySelector('[data-fa-cancel]').addEventListener('click', function () {
        cleanup(false);
      });
      backdrop.querySelector('[data-fa-ok]').addEventListener('click', function () {
        cleanup(true);
      });

      document.addEventListener('keydown', onKey);
      document.body.appendChild(backdrop);
      backdrop.querySelector('[data-fa-ok]').focus();
    });
  }

  global.OpsUI = {
    toast: toast,
    confirm: confirmDialog,
  };
})(window);
