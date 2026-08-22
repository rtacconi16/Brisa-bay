// Client-side redirect for the pre-Wix URLs (/where-to-buy.html, /wines.html).
//
// Wix static hosting cannot issue a 301: there is no _redirects file and no
// redirect configuration for uploaded files. A stub page is the only mechanism
// available, so these pages carry a <meta http-equiv="refresh"> as the baseline
// and this script on top of it, which preserves ?query and #hash — a shared
// locator link like /where-to-buy.html?near=miami keeps working.
//
// It lives in a file rather than inline because the site's CSP does not allow
// inline <script>; an inline redirect would be silently blocked, leaving only
// the meta refresh and dropping the query string.
//
// The target comes from the <script data-to="…"> attribute, and only ever a
// same-origin absolute path: anything else is ignored, so a stub can never be
// turned into an open redirect.
(function () {
  'use strict';
  var el = document.currentScript;
  var to = el && el.getAttribute('data-to');
  // One leading slash then a normal path. Rejects "//evil.com", "https://…",
  // "javascript:…" and anything else that would leave this origin.
  if (!to || !/^\/[A-Za-z0-9._~\-/]*$/.test(to)) return;
  location.replace(to + location.search + location.hash);
})();
