(function () {
  'use strict';

  if (window.__fmBlogAdsenseInit) return;
  window.__fmBlogAdsenseInit = true;

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
    var pending = pushReadyAds();
    if (pending.length) {
      requestAnimationFrame(function () {
        pending = pushReadyAds();
        if (pending.length) {
          window.setTimeout(function () {
            pending = pushReadyAds();
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
