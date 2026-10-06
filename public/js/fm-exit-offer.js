/**
 * FileMakr exit offer (FM10) — back navigation + desktop exit intent.
 * Single init; session-scoped frequency; server validates coupon via /api/coupon/validate.
 */
(function () {
  'use strict';

  if (window.__fmExitOfferInitialized) return;
  window.__fmExitOfferInitialized = true;

  var EXIT_OFFER_CONFIG = {
    enabled: true,
    couponCode: 'FM10',
    discountText: 'Flat 10% Extra Off',
    showOnBack: true,
    showOnDesktopExit: true,
    maxShowsPerSession: 1,
    exitIntentTopThresholdPx: 8,
    copyResetMs: 1800,
  };

  var STORAGE = {
    shown: 'fm_exit_offer_shown',
    applied: 'fm_exit_offer_applied',
    dismissed: 'fm_exit_offer_dismissed',
    pendingCoupon: 'fm_pending_coupon',
  };

  var BLOCK_EXACT = [
    '/login',
    '/register',
    '/privacy-policy',
    '/terms-and-conditions',
    '/refund-policy',
    '/contact-us',
    '/about-us',
  ];

  var BLOCK_PREFIXES = [
    '/admin',
    '/affiliation',
    '/freelancing',
    '/Shopkeeper',
    '/analytics',
    '/project-report-manager',
    '/source-code-manager',
    '/report-sales',
    '/setup-support',
    '/crm',
  ];

  var BLOCK_REGEX = [
    /^\/checkout\/report-ready/i,
    /^\/checkout\/review/i,
    /^\/payment/i,
    /^\/ccavenue/i,
    /^\/blog(\/|$)/i,
  ];

  var root;
  var dialog;
  var copyBtn;
  var applyBtn;
  var lastFocus = null;
  var modalVisible = false;
  var backTrapArmed = false;
  var backInterceptConsumed = false;
  var allowNativeBack = false;
  var popstateBound = false;
  var exitIntentBound = false;
  var touchDevice = false;
  var isApplyingCoupon = false;
  var scrollLockY = 0;
  var copyBtnDesktop;
  var pendingNavigateBack = false;

  function ssGet(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function ssSet(key, val) {
    try {
      sessionStorage.setItem(key, val);
    } catch (e) {}
  }

  function sessionBlocksOffer() {
    if (ssGet(STORAGE.applied) === '1') return true;
    if (ssGet(STORAGE.dismissed) === '1') return true;
    if (ssGet(STORAGE.shown) === '1') return true;
    return false;
  }

  function isTouchDevice() {
    if (touchDevice) return true;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    if ('ontouchstart' in window && window.innerWidth < 768) return true;
    return false;
  }

  function isMobileViewport() {
    return window.matchMedia && window.matchMedia('(max-width: 767.98px)').matches;
  }

  function lockBodyScroll() {
    scrollLockY = window.scrollY || window.pageYOffset || 0;
    document.body.classList.add('fm-exit-offer-open');
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + scrollLockY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
  }

  function unlockBodyScroll() {
    document.body.classList.remove('fm-exit-offer-open');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, scrollLockY);
  }

  function pathname() {
    return window.location.pathname || '/';
  }

  function isEligiblePath(path) {
    if (!path || path === '/') return false;

    if (BLOCK_EXACT.indexOf(path) >= 0) return false;
    for (var i = 0; i < BLOCK_PREFIXES.length; i++) {
      if (path.indexOf(BLOCK_PREFIXES[i]) === 0) return false;
    }
    for (var j = 0; j < BLOCK_REGEX.length; j++) {
      if (BLOCK_REGEX[j].test(path)) return false;
    }

    if (path === '/checkout') return true;
    if (path === '/order/now') return true;
    if (/\/source-code$/i.test(path) && path.indexOf('/source-code/') !== 0) return true;
    if (/-final-year-project-report\//i.test(path)) return true;
    if (/\/customization$/i.test(path)) return true;
    if (/^\/cse\//i.test(path) && /\/customization$/i.test(path)) return true;
    if (/^\/ieee-standard-project-report-/i.test(path) && /\/customization$/i.test(path)) return true;

    return false;
  }

  function canShowExitOffer() {
    if (!EXIT_OFFER_CONFIG.enabled) return false;
    if (!isEligiblePath(pathname())) return false;
    if (sessionBlocksOffer()) return false;
    if (modalVisible) return false;

    if (document.body.classList.contains('menu-opened')) return false;
    if (document.body.classList.contains('modal-open')) return false;

    var otherModal = document.querySelector(
      '.modal.show, .modal.in, .modal.fade.show, [role="dialog"][aria-modal="true"]:not(#fm-exit-offer-dialog)'
    );
    if (otherModal) return false;

    return true;
  }

  function trackExitOffer(eventName, metadata) {
    var meta = metadata || {};
    var payload = {
      event: eventName,
      coupon: EXIT_OFFER_CONFIG.couponCode,
      pathname: pathname(),
    };
    for (var k in meta) {
      if (Object.prototype.hasOwnProperty.call(meta, k)) payload[k] = meta[k];
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: eventName }, payload));
    if (typeof window.gtag === 'function') {
      try {
        window.gtag('event', eventName, payload);
      } catch (e) {}
    }
    if (typeof window.fbq === 'function') {
      try {
        window.fbq('trackCustom', eventName, payload);
      } catch (e) {}
    }
  }

  function getFocusable(container) {
    return Array.prototype.slice
      .call(
        container.querySelectorAll(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      )
      .filter(function (el) {
        return el.offsetParent !== null || el === document.activeElement;
      });
  }

  function trapFocus(e) {
    if (!modalVisible || !dialog) return;
    if (e.key !== 'Tab') return;
    var focusable = getFocusable(dialog);
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function parseRupeeText(text) {
    if (!text) return NaN;
    var n = parseFloat(String(text).replace(/[^\d.]/g, ''));
    return isFinite(n) ? n : NaN;
  }

  function moneyWhole(n) {
    return '₹' + Math.round(Number(n));
  }

  function moneyDecimal(n) {
    var x = Math.round(Number(n) * 100) / 100;
    return '₹' + x.toFixed(2);
  }

  function readListPriceFromPage() {
    var side = document.getElementById('sidePrice');
    if (side) {
      var sideVal = parseRupeeText(side.textContent);
      if (isFinite(sideVal) && sideVal > 0) return sideVal;
    }
    var total = document.getElementById('TotalAmt');
    if (total) {
      var totalVal = parseRupeeText(total.textContent);
      if (isFinite(totalVal) && totalVal > 0) return totalVal;
    }
    var pack = document.querySelector('.sc-pack-card__price, .sc-sticky-pack__price');
    if (pack) {
      var packVal = parseRupeeText(pack.textContent);
      if (isFinite(packVal) && packVal > 0) return packVal;
    }
    return NaN;
  }

  function readProductName() {
    var el = document.querySelector('.ckx-prod__name, .ck-product__name, .sc-hero__title h1, h1');
    if (el) {
      var t = (el.textContent || '').trim().replace(/\s+/g, ' ');
      if (t) return t.slice(0, 140);
    }
    return 'Your project';
  }

  function productTypeLabel() {
    var params = new URLSearchParams(window.location.search);
    var type = (params.get('type') || '').toLowerCase();
    if (type === 'report') return 'project report';
    if (type === 'source') return 'source code';
    if (/\/source-code$/i.test(pathname())) return 'source code';
    if (/-final-year-project-report\//i.test(pathname())) return 'project report';
    return 'order';
  }

  function fetchDiscountPercent() {
    return fetch(
      '/api/coupon/validate?code=' + encodeURIComponent(EXIT_OFFER_CONFIG.couponCode),
      { headers: { Accept: 'application/json' } }
    )
      .then(function (res) {
        if (!res.ok) return 10;
        return res.json();
      })
      .then(function (data) {
        if (data && data.valid && Number(data.discount) > 0) return Number(data.discount);
        return 10;
      })
      .catch(function () {
        return 10;
      });
  }

  function refreshOfferContent() {
    return fetchDiscountPercent().then(function (pct) {
      var list = readListPriceFromPage();
      if (!isFinite(list) || list <= 0) list = 99;
      var save = Math.round(list * pct) / 100;
      var final = Math.max(0, Math.round((list - save) * 100) / 100);
      save = Math.round((list - final) * 100) / 100;

      var name = readProductName();
      var typeLbl = productTypeLabel();
      var onCheckout = pathname() === '/checkout';

      var mobile = isMobileViewport();
      var badgeText = document.getElementById('fm-exit-offer-badge-text');
      if (badgeText) {
        badgeText.textContent = mobile
          ? 'Exclusive offer'
          : onCheckout
            ? 'Checkout-only offer'
            : 'Special exit offer';
      }

      var desc = document.getElementById('fm-exit-offer-desc');
      if (desc) {
        desc.textContent = mobile
          ? 'Complete your order now and save an extra 10%.'
          : 'Your ' +
            name +
            ' ' +
            typeLbl +
            ' is ready. Apply FM10 and complete your order at a lower price.';
      }

      var descLong = document.getElementById('fm-exit-offer-desc-long');
      if (descLong && !mobile) {
        descLong.textContent = desc ? desc.textContent : '';
      }

      var saveAmt = document.getElementById('fm-exit-offer-save-amt');
      if (saveAmt) saveAmt.textContent = moneyWhole(save);

      var was = document.getElementById('fm-exit-offer-was');
      if (was) was.textContent = moneyWhole(list);

      var nowEl = document.getElementById('fm-exit-offer-now');
      if (nowEl) nowEl.textContent = moneyDecimal(final);

      var pill = document.getElementById('fm-exit-offer-save-pill-text');
      if (pill) pill.textContent = 'You save ' + moneyDecimal(save) + ' extra';

      var ctaPrice = document.getElementById('fm-exit-offer-cta-price');
      if (ctaPrice) ctaPrice.textContent = moneyDecimal(final);

      var discountLine = document.getElementById('fm-exit-offer-discount-text');
      if (discountLine) discountLine.textContent = EXIT_OFFER_CONFIG.discountText;
    });
  }

  function showModalUi(trigger) {
    modalVisible = true;
    lastFocus = document.activeElement;

    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    root.classList.add('is-open');
    lockBodyScroll();

    ssSet(STORAGE.shown, '1');
    trackExitOffer('exit_offer_impression', { trigger: trigger || 'unknown' });
    if (trigger === 'back') trackExitOffer('exit_offer_back_trigger', { trigger: 'back' });
    if (trigger === 'desktop_exit') {
      trackExitOffer('exit_offer_desktop_exit_trigger', { trigger: 'desktop_exit' });
    }

    requestAnimationFrame(function () {
      if (!dialog) return;
      if (isMobileViewport()) {
        dialog.focus({ preventScroll: true });
      } else if (applyBtn) {
        applyBtn.focus({ preventScroll: true });
      } else {
        dialog.focus({ preventScroll: true });
      }
    });

    document.addEventListener('keydown', onDocKeydown);
  }

  function openModal(trigger) {
    if (!root || !dialog || modalVisible) return;
    if (!canShowExitOffer()) return;

    refreshOfferContent().then(function () {
      if (modalVisible || !canShowExitOffer()) return;
      showModalUi(trigger);
    });
  }

  function closeModal(reason, opts) {
    opts = opts || {};
    if (!root) return;

    modalVisible = false;
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    unlockBodyScroll();
    document.removeEventListener('keydown', onDocKeydown);

    var closeDelay = isMobileViewport() ? 280 : 260;
    window.setTimeout(function () {
      if (!modalVisible) root.hidden = true;
    }, closeDelay);

    if (reason === 'apply') {
      ssSet(STORAGE.applied, '1');
      allowNativeBack = true;
      backTrapArmed = false;
    }

    if (reason === 'dismiss' || reason === 'close' || reason === 'overlay') {
      ssSet(STORAGE.dismissed, '1');
      allowNativeBack = true;
      trackExitOffer('exit_offer_dismiss', { reason: reason });
    }
    if (reason === 'close' || reason === 'overlay') {
      trackExitOffer('exit_offer_close', { reason: reason });
    }

    if (opts.navigateAway) {
      allowNativeBack = true;
      backTrapArmed = false;
      pendingNavigateBack = true;
      window.setTimeout(function () {
        pendingNavigateBack = false;
        history.back();
      }, closeDelay);
    }

    if (applyBtn) {
      applyBtn.disabled = false;
      var mobileCta = applyBtn.querySelector('.fm-exit-offer__cta-mobile');
      var desktopCta = applyBtn.querySelector('.fm-exit-offer__cta-desktop');
      if (mobileCta) mobileCta.textContent = 'Apply FM10 & Continue';
      if (!desktopCta && !mobileCta) {
        /* legacy */
      }
    }

    if (!opts.fromPopstate && lastFocus && typeof lastFocus.focus === 'function') {
      try {
        lastFocus.focus({ preventScroll: true });
      } catch (e) {}
    }
  }

  function onDocKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal('close');
      return;
    }
    trapFocus(e);
  }

  function setCopyUi(ok) {
    var code = EXIT_OFFER_CONFIG.couponCode;
    if (copyBtn) {
      var prevLabel = 'Copy';
      copyBtn.textContent = ok ? 'Copied ✓' : prevLabel;
      copyBtn.classList.toggle('is-copied', ok);
      window.setTimeout(function () {
        copyBtn.textContent = prevLabel;
        copyBtn.classList.remove('is-copied');
      }, EXIT_OFFER_CONFIG.copyResetMs);
    }
    if (copyBtnDesktop) {
      copyBtnDesktop.textContent = ok ? 'Copied ✓' : code;
      copyBtnDesktop.classList.toggle('is-copied', ok);
      window.setTimeout(function () {
        copyBtnDesktop.textContent = code;
        copyBtnDesktop.classList.remove('is-copied');
      }, EXIT_OFFER_CONFIG.copyResetMs);
    }
  }

  function copyCouponCode() {
    var code = EXIT_OFFER_CONFIG.couponCode;
    var done = function (ok) {
      setCopyUi(ok);
    };

    trackExitOffer('exit_offer_coupon_copy', {});

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(
        function () {
          done(true);
        },
        function () {
          fallbackCopy(code, done);
        }
      );
      return;
    }
    fallbackCopy(code, done);
  }

  function fallbackCopy(text, cb) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      cb(!!ok);
    } catch (e) {
      cb(false);
    }
  }

  function tryApplyCouponOnPage() {
    var code = EXIT_OFFER_CONFIG.couponCode;
    var input = document.getElementById('coupon_code');
    var btn =
      document.getElementById('ApplyCoupon') ||
      document.getElementById('applyCouponBtn');
    if (input && btn) {
      input.value = code;
      btn.click();
      return true;
    }
    return false;
  }

  function applyOfferAndContinue() {
    if (isApplyingCoupon) return;
    isApplyingCoupon = true;

    if (applyBtn) {
      applyBtn.disabled = true;
      var mobileCta = applyBtn.querySelector('.fm-exit-offer__cta-mobile');
      if (mobileCta) mobileCta.textContent = 'Applying…';
    }

    trackExitOffer('exit_offer_apply', {});

    window.setTimeout(function () {
      if (!tryApplyCouponOnPage()) {
        ssSet(STORAGE.pendingCoupon, EXIT_OFFER_CONFIG.couponCode);
      }
      isApplyingCoupon = false;
      closeModal('apply');
    }, 80);
  }

  function maybeApplyPendingCoupon() {
    var pending = ssGet(STORAGE.pendingCoupon);
    if (!pending || pathname() !== '/checkout') return;
    if (tryApplyCouponOnPage()) {
      try {
        sessionStorage.removeItem(STORAGE.pendingCoupon);
      } catch (e) {}
    }
  }

  function onPopstate() {
    if (pendingNavigateBack) return;
    if (allowNativeBack) return;

    if (modalVisible) {
      allowNativeBack = true;
      closeModal('close', { fromPopstate: true });
      return;
    }

    if (!EXIT_OFFER_CONFIG.showOnBack) return;
    if (sessionBlocksOffer()) return;
    if (backInterceptConsumed) return;
    if (!isEligiblePath(pathname())) return;

    backInterceptConsumed = true;
    openModal('back');
  }

  function armBackTrap() {
    if (!EXIT_OFFER_CONFIG.showOnBack) return;
    if (backTrapArmed || sessionBlocksOffer()) return;
    if (!isEligiblePath(pathname())) return;

    backTrapArmed = true;
    try {
      history.pushState({ __fmExitOffer: 1 }, '', window.location.href);
    } catch (e) {
      backTrapArmed = false;
      return;
    }

    if (!popstateBound) {
      popstateBound = true;
      window.addEventListener('popstate', onPopstate);
    }
  }

  function onExitIntent(e) {
    if (!EXIT_OFFER_CONFIG.showOnDesktopExit) return;
    if (isTouchDevice()) return;
    if (modalVisible || sessionBlocksOffer()) return;
    if (!canShowExitOffer()) return;

    var y = e.clientY;
    if (typeof y !== 'number' || y > EXIT_OFFER_CONFIG.exitIntentTopThresholdPx) return;
    if (e.relatedTarget != null) return;

    document.documentElement.removeEventListener('mouseout', onExitIntent, true);
    exitIntentBound = false;
    openModal('desktop_exit');
  }

  function bindExitIntent() {
    if (exitIntentBound || isTouchDevice()) return;
    if (!EXIT_OFFER_CONFIG.showOnDesktopExit) return;
    exitIntentBound = true;
    document.documentElement.addEventListener('mouseout', onExitIntent, true);
  }

  function bindUi() {
    root = document.getElementById('fm-exit-offer-root');
    dialog = document.getElementById('fm-exit-offer-dialog');
    copyBtn = document.getElementById('fm-exit-offer-copy');
    copyBtnDesktop = document.getElementById('fm-exit-offer-copy-desktop');
    applyBtn = document.getElementById('fm-exit-offer-apply');
    if (!root || !dialog) return;

    root.addEventListener('click', function (e) {
      var t = e.target;
      if (!(t instanceof Element)) return;
      var dismiss = t.closest('[data-fm-exit-dismiss]');
      if (!dismiss) return;
      var kind = dismiss.getAttribute('data-fm-exit-dismiss');
      if (kind === 'overlay') {
        closeModal('overlay');
      } else if (kind === 'decline') {
        closeModal('dismiss', { navigateAway: true });
      } else {
        closeModal('close');
      }
    });

    dialog.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    if (copyBtn) copyBtn.addEventListener('click', copyCouponCode);
    if (copyBtnDesktop) copyBtnDesktop.addEventListener('click', copyCouponCode);
    if (applyBtn) {
      applyBtn.addEventListener('click', applyOfferAndContinue);
    }
  }

  function init() {
    if (!EXIT_OFFER_CONFIG.enabled) return;
    touchDevice = isTouchDevice();
    bindUi();
    if (!document.getElementById('fm-exit-offer-root')) return;

    maybeApplyPendingCoupon();

    if (canShowExitOffer()) {
      armBackTrap();
      bindExitIntent();
    }
  }

  window.trackExitOffer = trackExitOffer;
  window.FM_EXIT_OFFER_CONFIG = EXIT_OFFER_CONFIG;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
