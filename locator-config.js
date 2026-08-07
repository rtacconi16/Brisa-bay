// Everything about the store locator that depends on an outside service lives
// here, so switching provider is one edit rather than a search through two
// files. Loaded before store-map.js and the page component.
//
// ---------------------------------------------------------------------------
// PRODUCTION NOTE — tiles and geocoding
// ---------------------------------------------------------------------------
// The defaults below point at OpenStreetMap's tile servers and Komoot's public
// Photon instance. Both are community services provided on donated
// infrastructure with fair-use expectations and no SLA, and OSM's tile usage
// policy does not permit heavy or commercial use. They are fine for
// development and for this file to keep working out of the box; they are NOT a
// production configuration for a commercial brand site.
//
// Before launch, set `tiles` to a provider the business holds a contract with
// (MapTiler, Stadia, Mapbox, Carto) or to a self-hosted basemap (Protomaps),
// and point `geocode.endpoint` at a self-hosted Photon or a proxied commercial
// geocoder. Keys must live behind the proxy, never in this file — anything here
// ships to the browser.
//
// When the tile source changes, `tiles.attribution` MUST change with it. Most
// providers require specific attribution text as a condition of use.
// ---------------------------------------------------------------------------
(() => {
  window.BB_LOCATOR_CONFIG = {
    // Vendored locally: no third-party CDN at runtime, survives ad blockers and
    // corporate proxies, and keeps the CSP simple. Update via tools/vendor.sh.
    assets: {
      leafletCss: 'assets/vendor/leaflet/leaflet.css',
      leafletJs: 'assets/vendor/leaflet/leaflet.js',
      clusterCss: 'assets/vendor/leaflet/MarkerCluster.css',
      clusterJs: 'assets/vendor/leaflet/leaflet.markercluster.js'
    },

    tiles: {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
      // Guard rails so the map cannot be zoomed out to the whole globe or
      // panned into open ocean with no way back.
      minZoom: 3
    },

    // Stockist data. A separate file so adding a shop is a data edit reviewable
    // on its own, and so it can later come from a CMS or a build step without
    // touching the page.
    stores: {
      url: 'stores.json'
    },

    geocode: {
      endpoint: 'https://photon.komoot.io/api/',
      // Set true once `endpoint` is a first-party proxy that attaches the key
      // server-side; the client never holds a credential either way.
      proxied: false,
      limit: 8
    },

    // Instrumentation. `sink: null` keeps every event in the browser, which is
    // the default so nothing ships anywhere by accident. Set it to a
    // first-party collector URL, or to a function to hand events to whichever
    // analytics provider is chosen. Never put a third-party endpoint here
    // without checking it against privacy.html.
    analytics: {
      sink: null,
      debug: false
    },

    // Fallback view and the radius options offered in the toolbar.
    homeView: { center: [26.6, -80.4], zoom: 8 },
    radiusOptions: [0, 10, 25, 50, 100]
  };
})();
