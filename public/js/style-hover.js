(function () {
  'use strict';
  function apply(el, on) {
    const spec = el.getAttribute('style-hover');
    if (!spec) return;
    if (on) {
      if (el.dataset.bbStyleBase == null) el.dataset.bbStyleBase = el.getAttribute('style') || '';
      el.setAttribute('style', (el.dataset.bbStyleBase + ';' + spec).replace(/^;/, ''));
    } else if (el.dataset.bbStyleBase != null) {
      el.setAttribute('style', el.dataset.bbStyleBase);
    }
  }
  document.addEventListener('mouseover', function (e) {
    const el = e.target && e.target.closest && e.target.closest('[style-hover]');
    if (el) apply(el, true);
  });
  document.addEventListener('mouseout', function (e) {
    const el = e.target && e.target.closest && e.target.closest('[style-hover]');
    if (!el) return;
    const next = e.relatedTarget;
    if (next && el.contains(next)) return;
    apply(el, false);
  });
})();
