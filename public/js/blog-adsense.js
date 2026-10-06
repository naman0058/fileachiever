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
        '<ins class="adsbygoogle" style="display:block" data-ad-client="' +
        cfg.clientId +
        '" data-ad-slot="' +
        slot +
        '" data-ad-format="auto" data-full-width-responsive="true"></ins>' +
        '</div></aside>';
    });
  }

  function pushAds() {
    try {
      var nodes = document.querySelectorAll('ins.adsbygoogle:not([data-fm-ad-pushed])');
      nodes.forEach(function (ins) {
        ins.setAttribute('data-fm-ad-pushed', '1');
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      });
    } catch (_) {
      /* ad block / script blocked */
    }
  }

  function init() {
    mountFromMarkers();
    pushAds();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
