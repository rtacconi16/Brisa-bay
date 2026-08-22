(function () {
  'use strict';
  var G = window.BBAgeGate;
  if (!G) return;

  var host = {};
  var denied = false;

  function gate() { return document.querySelector('[data-bb-age-gate]'); }
  function ask() { return document.querySelector('[data-bb-gate-ask]'); }
  function deniedEl() { return document.querySelector('[data-bb-gate-denied]'); }

  function showDenied(on) {
    denied = !!on;
    var a = ask();
    var d = deniedEl();
    if (a) a.hidden = !!on;
    if (d) d.hidden = !on;
    sync();
  }

  function sync() {
    if (G.readOk()) {
      document.documentElement.setAttribute('data-bb-age-ok', '');
      G.syncModal(host, { gateOpen: false, gateDenied: false, faqOpen: faqOpen() });
      return;
    }
    G.syncModal(host, { gateOpen: true, gateDenied: denied, faqOpen: false });
  }

  function faqOpen() {
    var faq = document.querySelector('[data-bb-faq]');
    return !!(faq && !faq.hidden);
  }

  function accept() {
    G.writeOk();
    sync();
    var v = document.getElementById('bb-hero-video');
    if (v && v.paused && window.matchMedia('(min-width: 901px)').matches) {
      v.play().catch(function () {});
    }
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-bb-gate-accept]')) accept();
    else if (e.target.closest('[data-bb-gate-deny]')) showDenied(true);
    else if (e.target.closest('[data-bb-gate-retry]')) showDenied(false);
  });
  document.addEventListener('keydown', function (e) {
    var t = e.target.closest('[data-bb-gate-accept], [data-bb-gate-deny], [data-bb-gate-retry]');
    if (!t) return;
    G.activate(function () { t.click(); })(e);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
})();
