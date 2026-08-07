// Locator instrumentation.
//
// Deliberately provider-agnostic: events are shaped and queued here, and a sink
// configured in locator-config.js decides where they go. No vendor SDK is
// embedded, so choosing (or changing) an analytics provider is a config edit
// rather than a rewrite, and nothing third-party runs unless it is switched on.
//
// The event worth having is the one nothing else can tell you: which places
// people search for and find nothing. That is a direct read on where demand
// exists and distribution does not.
//
// PRIVACY
// Only interaction data is recorded — never GPS coordinates, never anything
// identifying. Search terms are places and shop names people typed to find a
// bottle. `sink: null` (the default) keeps everything in the browser, so this
// file is inert until someone deliberately points it somewhere.
(() => {
  const cfg = () => (window.BB_LOCATOR_CONFIG && window.BB_LOCATOR_CONFIG.analytics) || {};

  const queue = [];
  let flushTimer = null;

  function sessionId() {
    // Per-tab, not persisted: enough to stitch one visit's events together,
    // not enough to follow anyone between visits.
    if (!window.__bbSession) {
      window.__bbSession = Math.random().toString(36).slice(2, 10);
    }
    return window.__bbSession;
  }

  function flush() {
    flushTimer = null;
    if (!queue.length) return;
    const batch = queue.splice(0, queue.length);
    const { sink } = cfg();

    if (!sink) {
      if (cfg().debug && window.console) console.debug('[locator-analytics]', batch);
      return;
    }
    if (typeof sink === 'function') { sink(batch); return; }
    // A string sink is a first-party collector URL. sendBeacon so a click that
    // navigates away still reports.
    try {
      const body = JSON.stringify({ events: batch });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(sink, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(sink, { method: 'POST', body, keepalive: true,
                      headers: { 'Content-Type': 'application/json' } }).catch(() => {});
      }
    } catch (e) { /* analytics must never break the page */ }
  }

  function track(name, props) {
    try {
      queue.push({
        event: name,
        ts: Date.now(),
        session: sessionId(),
        path: location.pathname,
        ...(props || {})
      });
      // Batch so a burst of typing does not become a burst of requests.
      if (!flushTimer) flushTimer = setTimeout(flush, 1500);
      if (queue.length >= 20) { clearTimeout(flushTimer); flush(); }
    } catch (e) { /* never break the page */ }
  }

  // Anything still queued when the tab goes away.
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { clearTimeout(flushTimer); flush(); }
  });
  addEventListener('pagehide', () => { clearTimeout(flushTimer); flush(); });

  window.BBAnalytics = { track, flush };
})();
