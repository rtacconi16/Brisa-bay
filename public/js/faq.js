(function () {
  'use strict';
  var G = window.BBAgeGate;
  var host = {};

  function dialog() { return document.querySelector('[data-bb-faq]'); }
  function gateOpen() {
    if (G && G.readOk()) return false;
    var gate = document.querySelector('[data-bb-age-gate]');
    return !!(gate && !document.documentElement.hasAttribute('data-bb-age-ok'));
  }

  function isOpen() {
    var d = dialog();
    return !!(d && !d.hidden);
  }

  function setOpen(on) {
    var d = dialog();
    if (!d) return;
    if (on) d.removeAttribute('hidden');
    else d.setAttribute('hidden', '');
    if (G) {
      G.syncModal(host, { gateOpen: gateOpen(), gateDenied: false, faqOpen: !!on });
    }
  }

  document.addEventListener('click', function (e) {
    var open = e.target.closest('[data-bb-faq-open], a[href="#faqs"]');
    if (open) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (e.target.closest('[data-bb-faq-close]')) {
      setOpen(false);
      return;
    }
    var d = dialog();
    if (d && !d.hidden && e.target === d) setOpen(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen()) {
      e.preventDefault();
      setOpen(false);
      return;
    }
    var t = e.target.closest('[data-bb-faq-close], [data-bb-faq-open]');
    if (!t || !G) return;
    G.activate(function () { t.click(); })(e);
  });
})();
