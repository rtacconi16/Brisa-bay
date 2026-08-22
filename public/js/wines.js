(function () {
  'use strict';
  var names = ['Chardonnay', 'Sauvignon Blanc'];

  function apply(i) {
    i = i ? 1 : 0;
    document.querySelectorAll('[data-blend]').forEach(function (el) {
      el.setAttribute('data-blend', String(i));
    });
    var live = document.getElementById('bb-active-wine');
    if (live) live.textContent = 'Showing ' + names[i];
    var other = names[(i + 1) % 2];
    document.querySelectorAll('[data-bb-wine="flip"]').forEach(function (el) {
      el.setAttribute('aria-label', 'Show ' + other);
      el.setAttribute('title', 'Show ' + other);
    });
    var ch = document.getElementById('chardonnay');
    var sv = document.getElementById('sauvignon-blanc');
    if (ch) ch.setAttribute('aria-hidden', i !== 0 ? 'true' : 'false');
    if (sv) sv.setAttribute('aria-hidden', i !== 1 ? 'true' : 'false');
    var tabs = document.querySelectorAll('[data-bb-wine-tab]');
    if (tabs[0]) tabs[0].setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    if (tabs[1]) tabs[1].setAttribute('aria-selected', i === 1 ? 'true' : 'false');
  }

  function fromHash() {
    var h = String(location.hash || '').replace(/^#/, '').toLowerCase();
    if (h === 'sauvignon-blanc' || h === 'bb-wine-sauvignon') return 1;
    if (h === 'chardonnay' || h === 'bb-wine-chardonnay') return 0;
    return null;
  }

  function current() {
    var el = document.querySelector('[data-blend]');
    return el ? (Number(el.getAttribute('data-blend')) || 0) : 0;
  }

  function set(i) {
    i = i ? 1 : 0;
    apply(i);
    var hash = i === 1 ? '#sauvignon-blanc' : '#chardonnay';
    try { history.replaceState(null, '', location.pathname + location.search + hash); } catch (e) {}
  }

  function clonePourTrack() {
    var track = document.querySelector('[data-bb-pour-track]');
    if (!track || track.dataset.bbCloned === '1') return;
    Array.from(track.children).forEach(function (el) {
      var clone = el.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('tabindex', '-1');
      clone.querySelectorAll('img').forEach(function (img) {
        img.setAttribute('alt', '');
        img.setAttribute('loading', 'lazy');
      });
      track.appendChild(clone);
    });
    track.dataset.bbCloned = '1';
  }

  function boot() {
    clonePourTrack();
    var hashed = fromHash();
    apply(hashed === null ? 0 : hashed);
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-bb-wine]');
      if (!btn) return;
      var v = btn.getAttribute('data-bb-wine');
      if (v === 'flip') set(1 - current());
      else set(Number(v));
    });
    window.addEventListener('hashchange', function () {
      var h = fromHash();
      if (h !== null) apply(h);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
