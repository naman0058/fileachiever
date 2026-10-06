(function () {
  'use strict';

  if (window.__fmBlogAdsenseInit) return;
  window.__fmBlogAdsenseInit = true;

  var CLASS_UNFILLED = 'fm-blog-ad-slot--unfilled';
  var CLASS_FILLED = 'fm-blog-ad-slot--filled';

  function applyManualAdSlotStatusClass(wrapper, status) {
    var st = String(status || '').trim().toLowerCase();
    if (!wrapper || !wrapper.classList) return false;
    if (st === 'unfilled') {
      wrapper.classList.add(CLASS_UNFILLED);
      wrapper.classList.remove(CLASS_FILLED);
      return true;
    }
    if (st === 'filled') {
      wrapper.classList.add(CLASS_FILLED);
      wrapper.classList.remove(CLASS_UNFILLED);
      return true;
    }
    return false;
  }

  function watchManualAdFillStatus(ins) {
    var wrapper = ins.closest('.fm-blog-ad-slot');
    if (!wrapper || ins.getAttribute('data-fm-ad-status-watch') === '1') return;
    ins.setAttribute('data-fm-ad-status-watch', '1');

    if (applyManualAdSlotStatusClass(wrapper, ins.getAttribute('data-ad-status'))) return;

    if (!window.MutationObserver) return;

    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].attributeName !== 'data-ad-status') continue;
        if (applyManualAdSlotStatusClass(wrapper, ins.getAttribute('data-ad-status'))) {
          mo.disconnect();
          return;
        }
      }
    });
    mo.observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
  }

  function bindManualAdStatusWatchers() {
    document.querySelectorAll('.fm-blog-ad-slot ins.adsbygoogle').forEach(watchManualAdFillStatus);
  }

  function mountFromMarkers() {
    var cfg = window.__fmAdsenseConfig;
    if (!cfg || !cfg.enabled || !cfg.clientId) return;

    document.querySelectorAll('[data-fm-ad-mount]').forEach(function (mount) {
      if (mount.getAttribute('data-fm-ad-bound') === '1') return;
      var pos = mount.getAttribute('data-fm-ad-mount');
      var slot = cfg.slots && cfg.slots[pos];
      if (!slot) return;

      mount.setAttribute('data-fm-ad-bound', '1');
      mount.outerHTML =
        '<aside class="fm-blog-ad-slot fm-blog-ad-slot--' +
        pos +
        '" data-fm-ad-slot="' +
        pos +
        '" aria-label="Advertisement">' +
        '<span class="fm-blog-ad-label">Advertisement</span>' +
        '<div class="fm-blog-ad-slot__reserve">' +
        '<ins class="adsbygoogle" style="display:block;width:100%;min-height:90px" data-ad-client="' +
        cfg.clientId +
        '" data-ad-slot="' +
        slot +
        '" data-ad-format="auto" data-full-width-responsive="true"></ins>' +
        '</div></aside>';
    });
  }

  function slotContainerWidth(ins) {
    var box = ins.closest('.fm-blog-ad-slot__reserve') || ins.closest('.fm-blog-ad-slot') || ins.parentElement;
    if (!box) return 0;
    var w = box.offsetWidth || 0;
    if (w > 0) return w;
    var rect = box.getBoundingClientRect();
    return rect.width || 0;
  }

  function isSlotVisible(ins) {
    var box = ins.closest('.fm-blog-ad-slot');
    if (!box) return false;
    if (box.offsetParent === null && getComputedStyle(box).display === 'none') return false;
    return slotContainerWidth(ins) >= 200;
  }

  function pushOne(ins) {
    if (!ins || ins.getAttribute('data-fm-ad-pushed') === '1') return true;
    if (!ins.closest('.fm-blog-ad-slot')) return true;
    if (!isSlotVisible(ins)) return false;

    ins.setAttribute('data-fm-ad-pushed', '1');
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (_) {
      ins.removeAttribute('data-fm-ad-pushed');
    }
    return true;
  }

  function collectPending() {
    return Array.prototype.slice.call(
      document.querySelectorAll('.fm-blog-ad-slot ins.adsbygoogle:not([data-fm-ad-pushed])')
    );
  }

  function pushReadyAds() {
    var pending = [];
    collectPending().forEach(function (ins) {
      if (!pushOne(ins)) pending.push(ins);
    });
    return pending;
  }

  var visibleObserver = null;

  function observePending(pending) {
    if (!pending.length) return;
    if (!('IntersectionObserver' in window)) {
      window.setTimeout(function () {
        pushReadyAds();
        bindManualAdStatusWatchers();
      }, 400);
      return;
    }
    if (!visibleObserver) {
      visibleObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            var ins = entry.target;
            if (pushOne(ins)) visibleObserver.unobserve(ins);
          });
        },
        { root: null, rootMargin: '0px', threshold: 0.01 }
      );
    }
    pending.forEach(function (ins) {
      visibleObserver.observe(ins);
    });
  }

  function initAds() {
    mountFromMarkers();
    bindManualAdStatusWatchers();
    var pending = pushReadyAds();
    bindManualAdStatusWatchers();
    if (pending.length) {
      requestAnimationFrame(function () {
        pending = pushReadyAds();
        bindManualAdStatusWatchers();
        if (pending.length) {
          window.setTimeout(function () {
            pending = pushReadyAds();
            bindManualAdStatusWatchers();
            observePending(pending);
          }, 120);
        }
      });
    }
  }

  function start() {
    if (document.readyState === 'complete') {
      initAds();
    } else {
      window.addEventListener('load', initAds, { once: true });
    }
  }

  start();
})();
