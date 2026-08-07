// Serve the framework's runtime dependencies from our own origin.
//
// support.js resolves each CDN dependency through `cdnScriptFor`, which checks
// `window.__resources` for an override before falling back to unpkg. This file
// populates that map, so React and ReactDOM load from assets/vendor/react
// instead of a third party.
//
// Why it matters: the DC runtime renders every page on this site. With React
// coming from a CDN and no fallback, a blocked or unreachable unpkg meant not a
// degraded page but a blank one — on all seven pages at once. Ad blockers,
// corporate proxies, school and airline networks, and regional outages all
// cause this.
//
// MUST be loaded BEFORE support.js, or the override is read too late.
//
// Babel is deliberately NOT mapped. support.js only fetches it for `jsx`
// x-imports and the site has none, so it is never requested. If a JSX import is
// ever added, either vendor @babel/standalone@7.29.0 the same way (it is ~2.9MB,
// so prefer precompiling instead) or accept the CDN dependency knowingly.
//
// Refresh the vendored copies with ./tools/vendor.sh.
window.__resources = {
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js':
    'assets/vendor/react/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js':
    'assets/vendor/react/react-dom.production.min.js'
};
