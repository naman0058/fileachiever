/**
 * Minimal home-page JS — mobile nav only (replaces 369KB all.js on /).
 */
(function () {
  'use strict';

  var header = document.querySelector('.header-fixed, .fm-header.header, .fm-header');
  if (header && !document.querySelector('.sidebar-overlay')) {
    var overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    header.appendChild(overlay);
  }

  var overlay = document.querySelector('.sidebar-overlay');
  var mainWrapper = document.querySelector('.main-wrapper');
  var html = document.documentElement;

  function collapseMobileSubmenus() {
    document.querySelectorAll('.main-nav a.submenu').forEach(function (anchor) {
      anchor.classList.remove('submenu');
    });
    document.querySelectorAll('.main-nav li .submenu').forEach(function (submenu) {
      submenu.style.display = '';
    });
  }

  function closeMenu() {
    html.classList.remove('menu-opened');
    if (overlay) overlay.classList.remove('opened');
    if (mainWrapper) mainWrapper.classList.remove('slide-nav');
    collapseMobileSubmenus();
  }

  function openMenu() {
    if (mainWrapper) mainWrapper.classList.add('slide-nav');
    if (overlay) overlay.classList.add('opened');
    html.classList.add('menu-opened');
  }

  var mobileBtn = document.getElementById('mobile_btn');
  if (mobileBtn) {
    mobileBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (html.classList.contains('menu-opened')) closeMenu();
      else openMenu();
    });
  }

  var menuClose = document.getElementById('menu_close');
  if (menuClose) {
    menuClose.addEventListener('click', function (e) {
      e.preventDefault();
      closeMenu();
    });
  }

  if (overlay) overlay.addEventListener('click', closeMenu);

  function bindMobileSubmenus() {
    if (window.innerWidth > 991) return;
    document.querySelectorAll('.main-nav a').forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        var li = anchor.parentElement;
        if (!li || !li.classList.contains('has-submenu')) return;
        e.preventDefault();
        var submenu = anchor.nextElementSibling;
        if (anchor.classList.contains('submenu')) {
          anchor.classList.remove('submenu');
          if (submenu) submenu.style.display = '';
          return;
        }
        var rootUl = li.closest('.main-nav');
        if (rootUl) {
          rootUl.querySelectorAll('a.submenu').forEach(function (a) {
            a.classList.remove('submenu');
            var ul = a.nextElementSibling;
            if (ul && ul.tagName === 'UL') ul.style.display = '';
          });
        }
        anchor.classList.add('submenu');
        if (submenu) submenu.style.display = 'block';
      });
    });
  }

  bindMobileSubmenus();
  closeMenu();
})();
