/**
 * TEMPORARY Safari diagnostic for the age gate. Not part of the site.
 * Delete this and safari-check.html once the "buttons do nothing" bug is found.
 *
 * Loaded as an external script because safari-check.html carries the same
 * `script-src 'self'` CSP the real pages do — an inline script would be blocked,
 * which is precisely one of the things we are trying to detect.
 *
 * Structured so that no single failure can take down the rest: the click probe
 * attaches on DOMContentLoaded in its own try/catch, independently of the
 * `load`-time checks that inspect the site's scripts.
 */
(function () {
  'use strict';

  var findings = [];
  var cspHits = [];
  var jsErrors = [];

  // Registered before the site scripts load, so anything they trip is captured.
  // (Safari has historically not fired securitypolicyviolation — a silent
  // listener here is harmless, it just means CSP hits show up as load failures.)
  document.addEventListener('securitypolicyviolation', function (e) {
    cspHits.push(e.violatedDirective + ' blocked ' + (e.blockedURI || '(inline)'));
    render();
  });
  window.addEventListener('error', function (e) {
    jsErrors.push((e.message || 'error') +
      (e.filename ? ' @ ' + String(e.filename).split('/').pop() + ':' + e.lineno : ''));
    render();
  }, true);

  function add(label, ok, detail) {
    findings.push({ label: label, ok: ok, detail: detail == null ? '' : String(detail) });
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  function render() {
    // This script runs from <head>, so #out does not exist for the first few
    // calls. Skip those; DOMContentLoaded re-renders once the body is parsed.
    var out = document.getElementById('out');
    if (!out) return;

    var rows = findings.map(function (f) {
      var mark = f.ok === null ? '•' : (f.ok ? '✓' : '✗');
      var cls = f.ok === null ? 'info' : (f.ok ? 'ok' : 'bad');
      return '<tr class="' + cls + '"><td>' + mark + '</td><td>' + esc(f.label) +
        '</td><td>' + esc(f.detail) + '</td></tr>';
    }).join('');

    var extra = '';
    if (cspHits.length) {
      extra += '<h2 class="bad">CSP blocked ' + cspHits.length + ' thing(s)</h2><ul>' +
        cspHits.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul>';
    }
    if (jsErrors.length) {
      extra += '<h2 class="bad">JavaScript errors (' + jsErrors.length + ')</h2><ul>' +
        jsErrors.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul>';
    }
    if (!cspHits.length && !jsErrors.length) {
      extra += '<p class="ok">No CSP violations and no JavaScript errors so far.</p>';
    }

    out.innerHTML = '<table>' + rows + '</table>' + extra;
  }

  // ---- Environment -------------------------------------------------------
  // location.href first: it tells us whether this is http://localhost:8080 or a
  // file:// URL opened straight from Finder, which blocks scripts on its own.
  add('Page URL', null, location.href);
  add('User agent', null, navigator.userAgent);

  // ---- Storage: the gate remembers your answer here ----------------------
  try {
    localStorage.setItem('bb-probe', '1');
    var back = localStorage.getItem('bb-probe');
    localStorage.removeItem('bb-probe');
    add('localStorage read/write', back === '1', back === '1' ? 'working' : 'wrote 1, read back ' + back);
  } catch (e) {
    add('localStorage read/write', false, e.name + ': ' + e.message +
      '  → the gate can never remember your answer');
  }
  try {
    add('Current stored answer', null, 'bb-age-ok = ' + localStorage.getItem('bb-age-ok'));
  } catch (e) {
    add('Current stored answer', null, 'unreadable (' + e.name + ')');
  }

  // ---- Click probe: attached early and in isolation ----------------------
  // The real gate buttons are div[role=button] driven by a delegated React
  // handler. This one uses a plain addEventListener, so if it stays dead the
  // problem is upstream of the site's runtime entirely.
  document.addEventListener('DOMContentLoaded', function () {
    // Proof that this file parsed and ran at all.
    var banner = document.getElementById('noscript-banner');
    if (banner) banner.style.display = 'none';

    try {
      var btn = document.getElementById('probe-btn');
      var res = document.getElementById('clickres');
      var fired = { pointerdown: false, mousedown: false, mouseup: false, click: false };
      ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(function (type) {
        btn.addEventListener(type, function () {
          fired[type] = true;
          res.innerHTML = '<strong class="ok">pointerdown: ' + fired.pointerdown +
            ' &nbsp; mousedown: ' + fired.mousedown +
            ' &nbsp; mouseup: ' + fired.mouseup +
            ' &nbsp; click: ' + fired.click + '</strong>';
        });
      });
      res.textContent = 'Listeners attached. Not clicked yet.';
    } catch (e) {
      jsErrors.push('click probe failed to attach: ' + e.message);
    }

    render();
  });

  // ---- Did the site's own scripts load? ----------------------------------
  window.addEventListener('load', function () {
    add('site.css loaded', !!getComputedStyle(document.documentElement)
      .getPropertyValue('--bb-red').trim(), 'var(--bb-red) = ' +
      (getComputedStyle(document.documentElement).getPropertyValue('--bb-red').trim() || 'MISSING'));
    add('React loaded', typeof window.React !== 'undefined', typeof window.React);
    add('ReactDOM loaded', typeof window.ReactDOM !== 'undefined', typeof window.ReactDOM);
    add('BBAgeGate helper loaded', typeof window.BBAgeGate !== 'undefined',
      typeof window.BBAgeGate !== 'undefined' ? 'readOk() = ' + window.BBAgeGate.readOk() : 'MISSING');
    add('BBSite data loaded', typeof window.BBSite !== 'undefined', typeof window.BBSite);
    render();
  });

  render();
})();
