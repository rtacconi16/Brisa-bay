/**
 * Shared age-gate helpers for Brisa Bay pages.
 * Handles persistence, keyboard activation, inert background, and scroll lock.
 */
(function (global) {
  'use strict';

  var KEY = 'bb-age-ok';
  var FOCUSABLE = 'a[href],button,input,select,textarea,iframe,[tabindex]';

  function readOk() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }

  function writeOk() {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
  }

  /** Enter/Space handler for div[role=button] controls. */
  function activate(fn) {
    return function (e) {
      if (!e || (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar')) return;
      if (e.preventDefault) e.preventDefault();
      fn(e);
    };
  }

  /**
   * `inert` needs Safari 15.5+. Older engines get a tabindex/aria-hidden fallback
   * so keyboard users cannot tab past the age check into the site.
   */
  function setInert(el, on) {
    if (!el) return;
    if ('inert' in HTMLElement.prototype) {
      el.inert = !!on;
      return;
    }
    if (on) {
      el.setAttribute('aria-hidden', 'true');
      el.querySelectorAll(FOCUSABLE).forEach(function (n) {
        if (!n.hasAttribute('data-bb-prev-tabindex')) {
          n.setAttribute('data-bb-prev-tabindex', n.getAttribute('tabindex') ?? '');
        }
        n.setAttribute('tabindex', '-1');
      });
    } else {
      el.removeAttribute('aria-hidden');
      el.querySelectorAll('[data-bb-prev-tabindex]').forEach(function (n) {
        var prev = n.getAttribute('data-bb-prev-tabindex');
        if (prev === '') n.removeAttribute('tabindex');
        else n.setAttribute('tabindex', prev);
        n.removeAttribute('data-bb-prev-tabindex');
      });
    }
  }

  function pageShell() {
    return [
      document.getElementById('bb-content'),
      document.querySelector('[role="contentinfo"]'),
      document.querySelector('[data-bb-skiplink]')
    ];
  }

  function lockScroll(on) {
    var html = document.documentElement;
    if (on) {
      if (html.dataset.bbScrollLock == null) {
        html.dataset.bbScrollLock = html.style.overflow || '';
        document.body.dataset.bbScrollLock = document.body.style.overflow || '';
      }
      html.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } else {
      if (html.dataset.bbScrollLock != null) {
        html.style.overflow = html.dataset.bbScrollLock;
        document.body.style.overflow = document.body.dataset.bbScrollLock || '';
        delete html.dataset.bbScrollLock;
        delete document.body.dataset.bbScrollLock;
      } else {
        html.style.overflow = '';
        document.body.style.overflow = '';
      }
    }
  }

  /**
   * Keep the page behind a modal out of the tab order and lock body scroll.
   * Call from componentDidMount / componentDidUpdate with the current open state.
   *
   * host stores: _bbModalKey, _bbReturnFocus
   * opts: { gateOpen, gateDenied, faqOpen }
   */
  function syncModal(host, opts) {
    if (!host) return;
    var gateOpen = !!(opts && opts.gateOpen);
    var gateDenied = !!(opts && opts.gateDenied);
    var faqOpen = !!(opts && opts.faqOpen);
    var open = gateOpen || faqOpen;
    var key = gateOpen ? (gateDenied ? 'gate-denied' : 'gate') : (faqOpen ? 'faq' : null);
    if (key === host._bbModalKey) return;

    var shell = pageShell();
    if (open) {
      if (!host._bbModalKey) host._bbReturnFocus = document.activeElement;
      shell.forEach(function (el) { setInert(el, true); });
      lockScroll(true);
      setTimeout(function () {
        var dlg = gateOpen
          ? document.querySelector('[data-bb-age-gate]')
          : document.querySelector('[data-bb-faq]');
        if (!dlg) dlg = document.querySelector('[role="dialog"]');
        if (!dlg) return;
        if (!dlg.hasAttribute('tabindex')) dlg.setAttribute('tabindex', '-1');
        try { dlg.focus(); } catch (e) {}
      }, 0);
    } else {
      shell.forEach(function (el) { setInert(el, false); });
      lockScroll(false);
      var back = host._bbReturnFocus;
      host._bbReturnFocus = null;
      if (back && back.focus) setTimeout(function () { try { back.focus(); } catch (e) {} }, 0);
    }
    host._bbModalKey = key;
  }

  /** Always clear inert/scroll lock on unmount so a remount cannot leave the page stuck. */
  function cleanupModal(host) {
    pageShell().forEach(function (el) { setInert(el, false); });
    lockScroll(false);
    if (host) {
      host._bbModalKey = null;
      host._bbReturnFocus = null;
    }
  }

  global.BBAgeGate = {
    KEY: KEY,
    readOk: readOk,
    writeOk: writeOk,
    activate: activate,
    setInert: setInert,
    syncModal: syncModal,
    cleanupModal: cleanupModal
  };
})(typeof window !== 'undefined' ? window : globalThis);
