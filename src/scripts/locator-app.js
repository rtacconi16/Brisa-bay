import '../../locator-config.js';
import '../../locator-util.js';
import '../../locator-search.js';
import '../../locator-analytics.js';
import '../../store-map.js';
import { createClient, OAuthStrategy } from '@wix/sdk';
import { items } from '@wix/data';

const WIX_CLIENT_ID = 'e67c40ee-b5bc-459a-9e2b-267b8cf96c85';

// Stockists live in stores.json so a distribution change is a data edit, not a
// markup edit. Loaded at runtime; STORES stays empty for the first paint, which
// every consumer below is written to tolerate.
let STORES = [];
let storesStatus = 'loading';   // loading | ready | error

async function loadStores() {
  const cfg = (window.BB_LOCATOR_CONFIG && window.BB_LOCATOR_CONFIG.stores) || {};
  const url = cfg.url || '/stores.json';
  try {
    const wix = createClient({
      modules: { items },
      auth: OAuthStrategy({ clientId: WIX_CLIENT_ID })
    });
    const { items: rows } = await wix.items.query('Stockists').limit(200).find();
    const mapped = (rows || []).map((row) => {
      const d = row && (row.data || row);
      return {
        id: d.storeId || d.id,
        name: d.name,
        type: d.type,
        address: d.address,
        city: d.city,
        lat: Number(d.lat),
        lng: Number(d.lng),
        phone: d.phone || undefined,
        url: d.url || undefined
      };
    });
    const list = mapped.filter((s) => s && s.id && Number.isFinite(s.lat) && Number.isFinite(s.lng));
    if (list.length) return list;
  } catch (err) {
    if (window.console && console.error) console.error('[wix-data] collection query failed:', err);
  }
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error('stores ' + res.status);
  const data = await res.json();
  const list = Array.isArray(data) ? data : (data.stores || []);
  // Anything missing coordinates cannot be mapped or measured, so drop it here
  // rather than letting it produce NaN distances downstream.
  return list.filter((s) => s && s.id && Number.isFinite(s.lat) && Number.isFinite(s.lng));
}

const { milesBetween, formatMiles, directionsUrl, telHref } = window.BBLocator;
// Ranking and geocode filtering live in locator-search.js so the tests can
// import them instead of regex-scraping this file.
const {
  queryTokens, searchScore, textMatchesQuery,
  featureLabel, scoreGeocodeFeature, isPlausiblePlace
} = window.BBSearch;

const NEARBY_MI = 60;
// Past this, calling the result "near you" would be a stretch, so the page says
// so plainly instead.
const OUT_OF_RANGE_MI = 75;

/** Centroid of the stockist footprint, computed once. The previous version took
   the median latitude and the median longitude independently — two unrelated
   numbers describing a point that sits near no store at all. */
let _biasMemo = null;
function storeBias() {
  if (_biasMemo) return _biasMemo;
  // Do not memoise before the data arrives, or every later geocode is biased
  // to a centroid computed from nothing.
  if (!STORES.length) return { lat: 31.14, lng: -77.78 };
  const n = STORES.length;
  const sum = STORES.reduce((acc, s) => ({ lat: acc.lat + s.lat, lng: acc.lng + s.lng }), { lat: 0, lng: 0 });
  _biasMemo = { lat: sum.lat / n, lng: sum.lng / n };
  return _biasMemo;
}

const geocodeCache = new Map();

async function geocodePlace(q, { near = null, signal = null } = {}) {
  // Where the visitor actually is beats the dataset centroid every time.
  const bias = near || storeBias();
  const key = q.toLowerCase() + '@' + bias.lat.toFixed(2) + ',' + bias.lng.toFixed(2);
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  // Bias toward stockist region. Do not append ", USA" — that can drown out
  // local city hits (e.g. Coral Gables, FL) with unrelated US street names.
  const cfg = (window.BB_LOCATOR_CONFIG && window.BB_LOCATOR_CONFIG.geocode) || {};
  const params = new URLSearchParams({
    q: q,
    limit: String(cfg.limit || 8),
    lang: 'en',
    lat: String(bias.lat),
    lon: String(bias.lng)
  });
  const endpoint = cfg.endpoint || 'https://photon.komoot.io/api/';
  const res = await fetch(endpoint + '?' + params.toString(), { signal });
  if (!res.ok) throw new Error('geocode failed');
  const data = await res.json();
  const features = (data.features || []).filter((f) => f && f.geometry && f.geometry.coordinates);
  let out = null;
  if (features.length) {
    // Carry each candidate's original rank into the score, then re-sort.
    const ranked = features
      .map((f, i) => ({ f, score: scoreGeocodeFeature(f, bias, i), rank: i }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (isPlausiblePlace(best.f, bias, best.rank)) {
      const [lng, lat] = best.f.geometry.coordinates;
      out = { lat, lng, label: featureLabel(best.f.properties || {}, q) };
    }
  }
  geocodeCache.set(key, out);
  return out;
}

class LocatorApp {
  state = {
    query: '', typeFilter: null, active: null,
    userLoc: null, locStatus: 'idle',
    searchLoc: null, geoStatus: 'idle', geoQuery: '',
    sheetOpen: false, hoverId: null,
    radius: 0, storesReady: false,
    // areaBounds: the viewport the visitor asked us to filter to.
    // areaOffer: a viewport they have moved to but not yet asked about.
    areaBounds: null, areaOffer: null, areaOffscreen: 0
  };
  _geoTimer = null;
  _geoSeq = 0;

  componentDidMount() {
    this._onPick = (e) => {
      const id = e.detail;
      this.setState({ active: id, sheetOpen: true, hoverId: null }, () => this._scrollStoreIntoView(id));
    };
    this._onDeselect = () => {
      this.setState({ active: null, hoverId: null });
    };
    this._onLocate = () => this._requestLocation();
    this._onMapHover = (e) => {
      const id = e.detail || null;
      if (id === this.state.hoverId) return;
      this.setState({ hoverId: id }, () => {
        if (id) this._scrollStoreIntoView(id);
      });
    };
    document.addEventListener('store-select', this._onPick);
    document.addEventListener('store-deselect', this._onDeselect);
    document.addEventListener('store-locate', this._onLocate);
    document.addEventListener('store-hover', this._onMapHover);
    this._onMapMoved = (e) => {
      const b = e.detail;
      if (!b) return;
      const m = this._map();
      const offscreen = m && m.offscreenCount ? m.offscreenCount() : 0;
      // Already filtered to almost this view, or nothing is hidden by it —
      // then there is nothing useful to offer.
      if (this.state.areaBounds && offscreen === 0) {
        this.setState({ areaOffer: null, areaOffscreen: 0 });
        return;
      }
      this.setState({ areaOffer: b, areaOffscreen: offscreen });
    };
    document.addEventListener('store-map-moved', this._onMapMoved);
    // Escape closes the FAQ. It deliberately does NOT close the age gate —
    // dismissing a legal check with a keypress would defeat the point of it.
    loadStores().then((list) => {
      STORES = list;
      storesStatus = 'ready';
      _biasMemo = null;
      if (window.BBStructuredData) window.BBStructuredData.emit(list);
      this.setState({ storesReady: true }, () => this._readUrlState());
    }).catch((err) => {
      storesStatus = 'error';
      this.setState({ storesReady: true });
      if (window.console && console.error) console.error('[locator] stores.json', err);
    });
    this._resumeLocationIfGranted();
    this.render();
  }

  /** ?near / ?type / ?radius / ?store make a result shareable, survivable
     across a refresh, and linkable from anywhere else on the site. */
  _readUrlState() {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    const near = (params.get('near') || '').trim();
    const type = (params.get('type') || '').trim();
    const radius = Number(params.get('radius')) || 0;
    const store = (params.get('store') || '').trim();

    const patch = {};
    if (near) patch.query = near;
    if (type && STORES.some((s) => s.type === type)) patch.typeFilter = type;
    if ([10, 25, 50, 100].includes(radius)) patch.radius = radius;
    if (store && STORES.some((s) => s.id === store)) {
      patch.active = store;
      patch.sheetOpen = true;
    }
    if (!Object.keys(patch).length) return;
    this.setState(patch, () => {
      if (patch.query && !this._pool().some((s) => textMatchesQuery(s, patch.query))) {
        this._runGeocode(patch.query);
      }
      if (patch.active) setTimeout(() => this.select(patch.active), 400);
    });
  }

  _writeUrlState() {
    if (!window.history || !window.history.replaceState) return;
    clearTimeout(this._urlTimer);
    this._urlTimer = setTimeout(() => {
      const params = new URLSearchParams();
      const q = this.state.query.trim();
      if (q) params.set('near', q);
      if (this.state.typeFilter) params.set('type', this.state.typeFilter);
      if (this.state.radius) params.set('radius', String(this.state.radius));
      if (this.state.active) params.set('store', this.state.active);
      const qs = params.toString();
      const next = window.location.pathname + (qs ? '?' + qs : '');
      if (next === window.location.pathname + window.location.search) return;
      // replaceState, not pushState: typing a query should not bury the page
      // the visitor arrived from under a dozen history entries.
      try { window.history.replaceState(null, '', next); } catch (e) {}
    }, 300);
  }


  /** Only auto-locate for people who have already granted the permission on a
     previous visit. Prompting an unknown visitor on load is the pattern people
     reflexively deny, and a denial sticks for the whole origin. */
  _resumeLocationIfGranted() {
    if (!navigator.geolocation || !navigator.permissions || !navigator.permissions.query) return;
    try {
      navigator.permissions.query({ name: 'geolocation' }).then((status) => {
        if (status && status.state === 'granted') this._requestLocation();
      }).catch(() => {});
    } catch (e) { /* Safari <16 throws on unknown descriptors */ }
  }
  componentDidUpdate() {
    if (this.state.active && this.state.active !== this._scrolledFor) {
      this._scrolledFor = this.state.active;
      this._scrollStoreIntoView(this.state.active);
    }
    this._writeUrlState();
  }

  componentWillUnmount() {
    document.removeEventListener('store-select', this._onPick);
    document.removeEventListener('store-deselect', this._onDeselect);
    document.removeEventListener('store-locate', this._onLocate);
    document.removeEventListener('store-hover', this._onMapHover);
    document.removeEventListener('store-map-moved', this._onMapMoved);
    clearTimeout(this._geoTimer);
    clearTimeout(this._urlTimer);
  }

  _map() { return document.querySelector('store-map'); }

  _track(name, props) {
    if (window.BBAnalytics) window.BBAnalytics.track(name, props);
  }

  /** Report a settled search once the user stops typing, not per keystroke, and
     record whether it found anything. Zero-result searches are the point. */
  _trackSearch() {
    clearTimeout(this._trackTimer);
    this._trackTimer = setTimeout(() => {
      const q = this.state.query.trim();
      if (q.length < 2) return;
      const { matches } = this._filteredStores();
      const nearest = matches.length && matches[0].mi != null ? Math.round(matches[0].mi) : null;
      this._track('locator_search', {
        query: q.toLowerCase().slice(0, 80),
        results: matches.length,
        nearest_mi: nearest,
        geo: this.state.geoStatus,
        type_filter: this.state.typeFilter || null,
        radius: this.state.radius || null
      });
      if (!matches.length || (nearest != null && nearest > OUT_OF_RANGE_MI)) {
        // The commercially interesting one: someone looked, and we are not there.
        this._track('locator_gap', {
          query: q.toLowerCase().slice(0, 80),
          place: this.state.searchLoc ? this.state.searchLoc.label : null,
          nearest_mi: nearest
        });
      }
    }, 1200);
  }

  /** Every control here is a div[role=button], so Enter/Space have to be wired
     by hand to match what a real <button> would do. */
  _activate(fn) {
    return window.BBAgeGate ? window.BBAgeGate.activate(fn) : fn;
  }

  _scrollStoreIntoView(id) {
    if (id == null) return;
    const run = () => {
      const row = document.querySelector('[data-store-id="' + String(id).replace(/"/g, '\\"') + '"]');
      const sc = document.querySelector('[data-bb-store-scroll]');
      if (!row || !sc) return;
      const r = row.getBoundingClientRect();
      const p = sc.getBoundingClientRect();
      if (r.top >= p.top + 4 && r.bottom <= p.bottom - 4) return;
      const delta = (r.top - p.top) - (p.height * 0.35);
      sc.scrollTop = Math.max(0, sc.scrollTop + delta);
    };
    setTimeout(run, 0);
  }

  _activeIfVisible(active, matches) {
    if (!active) return null;
    return matches.some((s) => s.id === active) ? active : null;
  }

  _syncMapLocation(loc) {
    const m = this._map();
    if (m && m.setUserLocation && loc) m.setUserLocation(loc.lat, loc.lng, { fit: true, animate: true });
  }

  _requestLocation() {
    if (!navigator.geolocation) {
      this.setState({ locStatus: 'unsupported' });
      return;
    }
    if (this.state.locStatus === 'pending') return;
    this.setState({ locStatus: 'pending' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Grant/deny rate only — never the coordinates themselves.
        this._track('locator_geolocation', { outcome: 'granted' });
        this.setState({ userLoc: loc, locStatus: 'ready' });
        this._syncMapLocation(loc);
        let tries = 0;
        const retry = () => {
          tries += 1;
          const m = this._map();
          if (m && m.setUserLocation) m.setUserLocation(loc.lat, loc.lng, { fit: true, animate: true });
          else if (tries < 20) setTimeout(retry, 150);
        };
        setTimeout(retry, 120);
      },
      (err) => {
        const denied = err && err.code === 1;
        this._track('locator_geolocation', { outcome: denied ? 'denied' : 'error' });
        this.setState({ locStatus: denied ? 'denied' : 'error', userLoc: null });
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
    );
  }

  select(id) {
    this.setState({ active: id, sheetOpen: true }, () => this._scrollStoreIntoView(id));
    const m = this._map();
    if (m && m.focusStore) m.focusStore(id, true);
    const store = STORES.find((s) => s.id === id);
    this._track('locator_store_select', {
      store_id: id,
      store_city: store ? store.city : null,
      store_type: store ? store.type : null
    });
  }

  _refLoc() {
    return this.state.searchLoc || this.state.userLoc;
  }

  _pool(typeFilter) {
    const type = typeFilter === undefined ? this.state.typeFilter : typeFilter;
    return STORES.filter((s) => !type || s.type === type);
  }

  _scheduleGeocode(query) {
    clearTimeout(this._geoTimer);
    const q = query.trim();
    if (q.length < 3) {
      this._clearSearchLoc();
      return;
    }
    this._geoTimer = setTimeout(() => this._runGeocode(q), 450);
  }

  _clearSearchLoc() {
    this.setState({ searchLoc: null, geoStatus: 'idle', geoQuery: '' });
    const m = this._map();
    if (m && m.clearSearchLocation) m.clearSearchLocation();
  }

  async _runGeocode(q) {
    const seq = ++this._geoSeq;
    if (this._geoAbort) this._geoAbort.abort();
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    this._geoAbort = ctrl;
    this.setState({ geoStatus: 'pending', geoQuery: q });
    try {
      const place = await geocodePlace(q, {
        near: this.state.userLoc,
        signal: ctrl ? ctrl.signal : null
      });
      if (seq !== this._geoSeq || this.state.query.trim() !== q) return;
      if (!place) {
        this.setState({ searchLoc: null, geoStatus: 'miss' });
        const m = this._map();
        if (m && m.clearSearchLocation) m.clearSearchLocation();
        return;
      }
      this.setState({ searchLoc: place, geoStatus: 'ready', geoQuery: q });
      const sync = () => {
        const map = this._map();
        if (map && map.setSearchLocation) map.setSearchLocation(place.lat, place.lng, { fit: true, animate: true });
        if (map && map.setRadius) map.setRadius(Number(this.state.radius) || 0);
      };
      sync();
      setTimeout(sync, 120);
    } catch (e) {
      if (seq !== this._geoSeq || (e && e.name === 'AbortError')) return;
      // A dead endpoint is not the same as "no such place" — say so.
      const offline = !(e instanceof TypeError) ? 'miss' : 'error';
      this.setState({ searchLoc: null, geoStatus: offline });
    }
  }

  /** Returns { matches, beyond } — beyond holds the closest stores that the
     radius filter excluded, so the empty state can offer them instead of a
     dead end. */
  _filteredStores() {
    const q = this.state.query.trim();
    const tokens = queryTokens(q);
    const pool = this._pool();
    const loc = this._refLoc();
    let matches;
    let textRanked = false;

    if (!tokens.length) {
      matches = pool.slice();
    } else {
      const textHits = pool
        .map((s) => ({ s, score: searchScore(s, tokens) }))
        .filter((x) => x.score > 0);
      if (textHits.length) {
        matches = textHits.map((x) => ({ ...x.s, score: x.score }));
        textRanked = true;
      } else if (this.state.searchLoc && this.state.geoStatus === 'ready') {
        // Address/ZIP lookup: nearest stockists to that place
        matches = pool.slice();
      } else {
        matches = [];
      }
    }

    matches = matches.map((s) => {
      const mi = loc ? milesBetween(loc, s) : null;
      return { ...s, mi };
    });

    // Relevance first when the visitor typed a name; distance decides ties and
    // is the only ordering when they didn't.
    if (textRanked) {
      matches.sort((a, b) => (b.score - a.score) || ((a.mi == null ? 0 : a.mi) - (b.mi == null ? 0 : b.mi)));
    } else if (loc) {
      matches.sort((a, b) => a.mi - b.mi);
    }

    // When searching by place, prefer stores within range; otherwise keep closest few
    if (!textRanked && tokens.length && this.state.searchLoc && matches.length) {
      const near = matches.filter((s) => s.mi != null && s.mi <= NEARBY_MI);
      matches = near.length ? near : matches.slice(0, 8);
    }

    // Filtering to the viewport the visitor chose. Applied before radius so the
    // two compose rather than fight.
    const area = this.state.areaBounds;
    if (area) {
      matches = matches.filter((s) =>
        s.lat <= area.north && s.lat >= area.south
        && s.lng <= area.east && s.lng >= area.west);
    }

    // Radius only means something once we have somewhere to measure from.
    const radius = Number(this.state.radius) || 0;
    let beyond = [];
    if (loc && radius > 0) {
      const within = matches.filter((s) => s.mi != null && s.mi <= radius);
      beyond = matches
        .filter((s) => s.mi != null && s.mi > radius)
        .sort((a, b) => a.mi - b.mi)
        .slice(0, 3);
      matches = within;
    }
    return { matches, beyond };
  }

  compute() {
    const userLoc = this.state.userLoc;
    const searchLoc = this.state.searchLoc;
    const loc = this._refLoc();
    const { matches, beyond } = this._filteredStores();
    const active = this._activeIfVisible(this.state.active, matches);
    const q = this.state.query.trim();
    const radius = Number(this.state.radius) || 0;
    const hasTextHits = !q || this._pool().some((s) => textMatchesQuery(s, q));

    const types = [...new Set(STORES.map((s) => s.type))].sort((a, b) => a.localeCompare(b));
    const typeFilters = [
      {
        label: 'All',
        active: !this.state.typeFilter,
        onSelect: () => this.setState({ typeFilter: null })
      },
      ...types.map((t) => ({
        label: t,
        active: this.state.typeFilter === t,
        onSelect: () => {
          const typeFilter = this.state.typeFilter === t ? null : t;
          const next = this._pool(typeFilter);
          this.setState({ typeFilter, active: this._activeIfVisible(this.state.active, next) });
        }
      }))
    ].map((chip) => ({ ...chip, onKey: this._activate(chip.onSelect) }));

    const nearest = loc && matches.length ? matches[0] : null;
    const status = this.state.locStatus;
    const locReady = status === 'ready' && !!userLoc && !searchLoc;
    const showLocPrompt = !searchLoc && (status === 'idle' || status === 'denied' || status === 'error' || status === 'unsupported');
    let locPromptLabel = 'Near me';
    if (status === 'denied') locPromptLabel = 'Location blocked';
    else if (status === 'error') locPromptLabel = 'Try again';
    else if (status === 'unsupported') locPromptLabel = 'Unavailable';

    // No running total. The status line is for things the visitor cannot see
    // for themselves — what we are doing, where we searched, whether we are
    // anywhere near them — not for counting rows they can already scroll.
    let statusCopy = '';
    if (storesStatus === 'loading') statusCopy = 'Loading stockists…';
    else if (storesStatus === 'error') statusCopy = 'Could not load the stockist list.';
    else if (status === 'pending') statusCopy = 'Looking around your neighborhood…';
    else if (this.state.geoStatus === 'pending' && !hasTextHits) statusCopy = 'Looking around that neighborhood…';
    else if (this.state.geoStatus === 'error' && !hasTextHits && q.length >= 3) statusCopy = 'Place search is unavailable right now — try a store or city name.';
    else if (this.state.geoStatus === 'miss' && !hasTextHits && q.length >= 3) statusCopy = 'Could not find that place — try a city or ZIP.';
    else if (searchLoc && this.state.geoStatus === 'ready') {
      statusCopy = 'Near ' + searchLoc.label + (nearest ? ' · ' + formatMiles(nearest.mi) : '');
    } else if (locReady && nearest) {
      statusCopy = 'Nearest first · ' + formatMiles(nearest.mi);
    }

    // The page promises "Find the Brisa Near You". For most of the country the
    // honest answer is "not yet" — say it, rather than quietly offering a shop
    // several states away as though it answered the question.
    const outOfRange = !!(nearest && nearest.mi != null && nearest.mi > OUT_OF_RANGE_MI);
    const searchPlace = searchLoc ? searchLoc.label.split(',')[0] : 'your area';

    const showFeatured = !!(nearest && (locReady || (searchLoc && this.state.geoStatus === 'ready')));
    const featured = showFeatured ? {
      eyebrow: outOfRange
        ? 'Not here yet'
        : (searchLoc ? 'Close to your search' : 'Closest to you'),
      name: outOfRange ? ('No stockists in ' + searchPlace + ' yet') : nearest.name,
      line: outOfRange
        ? ('The nearest is ' + nearest.name + ' in ' + nearest.city + ', ' + formatMiles(nearest.mi) + ' away.')
        : [nearest.type, nearest.city, nearest.mi != null ? formatMiles(nearest.mi) : ''].filter(Boolean).join(' · '),
      onSelect: () => this.select(nearest.id),
      onKey: this._activate(() => this.select(nearest.id))
    } : { eyebrow: '', name: '', line: '', onSelect: () => {}, onKey: () => {} };

    if (outOfRange && searchLoc) {
      statusCopy = 'Nothing in ' + searchPlace + ' yet · nearest ' + formatMiles(nearest.mi);
    }

    const dirOrigin = loc;
    const mapStores = matches.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      address: s.address,
      city: s.city,
      lat: s.lat,
      lng: s.lng,
      phone: s.phone || '',
      tel: telHref(s.phone),
      url: s.url || '',
      distance: formatMiles(s.mi),
      directions: directionsUrl(s, dirOrigin)
    }));

    // When featuring the nearest store, keep it in the list too (directory feel)
    const listStores = matches;

    // Named once so click and Enter/Space share an implementation.
    const doReset = () => {
      clearTimeout(this._geoTimer);
      this.setState({ active: null, query: '', typeFilter: null, searchLoc: null, geoStatus: 'idle', geoQuery: '', sheetOpen: false, hoverId: null, radius: 0, areaBounds: null, areaOffer: null, areaOffscreen: 0 });
      const m = this._map();
      if (m && m.clearSearchLocation) m.clearSearchLocation();
      if (m && m.highlightStore) m.highlightStore(null);
      if (m && m.setRadius) m.setRadius(0);
      if (m && m.resetView) setTimeout(() => { const map = this._map(); if (map && map.resetView) map.resetView(); }, 50);
    };
    const doClearFilters = () => {
      this.setState({ typeFilter: null, radius: 0, areaBounds: null, areaOffer: null });
      const m = this._map();
      if (m && m.setRadius) m.setRadius(0);
    };
    const doSearchArea = () => {
      // Adopt the viewport as a filter and leave the map exactly where it is.
      this._track('locator_area_search', { hidden: this.state.areaOffscreen });
      this.setState({
        areaBounds: this.state.areaOffer,
        areaOffer: null,
        active: null,
        sheetOpen: true
      });
    };
    const doClearArea = () => {
      this.setState({ areaBounds: null, areaOffer: null, areaOffscreen: 0 });
      const m = this._map();
      if (m && m.fitWithoutPrompting) {
        setTimeout(() => {
          const map = this._map();
          if (map && map.fitWithoutPrompting) {
            map.fitWithoutPrompting(null, {
              animate: true,
              includeAnchor: !!this._refLoc(),
              anchor: null
            });
          }
        }, 50);
      }
    };

    // The radius select is meaningless without somewhere to measure from.
    const radiusHint = loc ? '' : 'Set your location to filter by distance';

    return {

      contactEmail: this.contactEmail,
      showList: true,
      showSearch: true,
      query: this.state.query,
      onQuery: (e) => {
        const query = e.target.value;
        const qTrim = query.trim();
        const pool = this._pool();
        const textHits = !qTrim ? pool : pool.filter((s) => textMatchesQuery(s, qTrim));
        const patch = {
          query,
          active: this._activeIfVisible(this.state.active, textHits.length ? textHits : pool),
          sheetOpen: true
        };
        if (!qTrim) {
          clearTimeout(this._geoTimer);
          clearTimeout(this._trackTimer);
          patch.searchLoc = null;
          patch.geoStatus = 'idle';
          patch.geoQuery = '';
          this.setState(patch);
          const m = this._map();
          if (m && m.clearSearchLocation) m.clearSearchLocation();
          return;
        }
        // Every non-empty search reports, whether it resolved by text or by
        // geocode. The debounce inside means only the settled query is sent.
        this._trackSearch();
        if (textHits.length) {
          clearTimeout(this._geoTimer);
          patch.searchLoc = null;
          patch.geoStatus = 'idle';
          patch.geoQuery = '';
          this.setState(patch);
          const m = this._map();
          if (m && m.clearSearchLocation) m.clearSearchLocation();
          return;
        }
        this.setState(patch);
        this._scheduleGeocode(query.trim());
      },
      typeFilters,
      radius: String(this.state.radius),
      radiusOptions: [
        { value: '0', label: 'Any distance' },
        { value: '10', label: '10 mi' },
        { value: '25', label: '25 mi' },
        { value: '50', label: '50 mi' },
        { value: '100', label: '100 mi' }
      ].map((o) => ({ ...o, selected: String(this.state.radius) === o.value ? 'selected' : '' })),
      onRadius: (e) => {
        const v = Number((e && e.target ? e.target.value : '0')) || 0;
        this.setState({ radius: v });
        const m = this._map();
        if (m && m.setRadius) m.setRadius(v);
        // A radius is a request to measure from somewhere. If we have nowhere
        // to measure from yet, that is the moment to ask.
        if (v > 0 && !this._refLoc()) this._requestLocation();
      },
      radiusHint,
      // "Nothing nearby" is only true once we know what there is.
      noResults: storesStatus === 'ready' && matches.length === 0 && this.state.geoStatus !== 'pending',
      storesFailed: storesStatus === 'error',
      showBeyond: matches.length === 0 && beyond.length > 0,
      beyondLabel: radius ? 'Nothing within ' + radius + ' mi. The closest are:' : 'The closest are:',
      beyondStores: beyond.map((s) => ({
        id: s.id,
        name: s.name,
        line: [s.type, s.city, s.mi != null ? formatMiles(s.mi) : ''].filter(Boolean).join(' · '),
        onSelect: () => this.select(s.id),
        onKey: this._activate(() => this.select(s.id))
      })),
      showClearFilters: matches.length === 0 && !!(this.state.typeFilter || radius || this.state.areaBounds),
      clearFilters: doClearFilters,
      clearFiltersKey: this._activate(doClearFilters),
      storesJson: JSON.stringify(mapStores),
      activeId: active || '',
      holdView: this.state.areaBounds ? 'true' : 'false',
      statusCopy,
      showFeatured,
      featured,
      showAreaSearch: !!this.state.areaOffer && !this.state.areaBounds,
      areaSearchLabel: this.state.areaOffscreen
        ? 'Search this area · ' + this.state.areaOffscreen + ' hidden'
        : 'Search this area',
      searchArea: doSearchArea,
      searchAreaKey: this._activate(doSearchArea),
      showAreaClear: !!this.state.areaBounds,
      areaClearLabel: 'Showing this area only · clear',
      clearArea: doClearArea,
      clearAreaKey: this._activate(doClearArea),
      outOfRange,
      askPlace: searchPlace,
      // mailto keeps this working with no backend. Swap for a POST to a
      // capture endpoint once one exists — the interesting signal is which
      // places get asked for, and that belongs in a database, not an inbox.
      onAskClick: () => this._track('locator_stockist_request', {
        place: searchPlace,
        nearest_mi: nearest && nearest.mi != null ? Math.round(nearest.mi) : null
      }),
      askMailto: 'mailto:' + this.contactEmail
        + '?subject=' + encodeURIComponent('Stockist request: ' + searchPlace)
        + '&body=' + encodeURIComponent(
            'I\'d like to buy Brisa Bay near ' + searchPlace + '.\n\n'
            + '(Nearest listed stockist: ' + (nearest ? nearest.name + ', ' + nearest.city : 'n/a') + ')'),
      showLocPrompt,
      locPromptLabel,
      requestLoc: () => this._requestLocation(),
      requestLocKey: this._activate(() => this._requestLocation()),
      sheetState: this.state.sheetOpen ? 'open' : 'peek',
      sheetExpanded: this.state.sheetOpen ? 'true' : 'false',
      toggleSheet: () => this.setState({ sheetOpen: !this.state.sheetOpen }),
      toggleSheetKey: this._activate(() => this.setState({ sheetOpen: !this.state.sheetOpen })),
      visibleStores: listStores.map((s, i) => {
        return {
          ...s,
          isActive: active === s.id ? 'true' : 'false',
          isHover: this.state.hoverId === s.id ? 'true' : 'false',
          index: String(i + 1).padStart(2, '0'),
          stop: (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            this._track('locator_directions', { store_id: s.id, store_city: s.city });
          },
          delay: Math.min(i, 8) * 0.04 + 's',
          distance: formatMiles(s.mi),
          directions: directionsUrl(s, dirOrigin),
          hasPhone: !!s.phone,
          phone: s.phone || '',
          tel: telHref(s.phone),
          hasUrl: !!s.url,
          url: s.url || '',
          label: [s.name, s.type, s.address, s.city, s.mi != null ? formatMiles(s.mi) + ' away' : '']
            .filter(Boolean).join(', '),
          onSelect: () => this.select(s.id),
          onKey: this._activate(() => this.select(s.id)),
          onHover: () => {
            if (this.state.hoverId === s.id) return;
            this.setState({ hoverId: s.id });
            const m = this._map();
            if (m && m.highlightStore) m.highlightStore(s.id);
          },
          onLeave: () => {
            if (this.state.hoverId !== s.id) return;
            this.setState({ hoverId: null });
            const m = this._map();
            if (m && m.highlightStore) m.highlightStore(null);
          }
        };
      }),
      resetView: doReset,
      resetViewKey: this._activate(doReset)
    };
  }
}


LocatorApp.prototype.setState = function (patch, cb) {
  Object.assign(this.state, patch);
  this.render();
  this.componentDidUpdate();
  if (typeof cb === 'function') cb();
};

LocatorApp.prototype.render = function () {
  const v = this.compute();
  this.paint(v);
};

LocatorApp.prototype.paint = function (v) {
  const root = this.root;
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const search = root.querySelector('[data-bb-search-wrap] input');
  if (search && document.activeElement !== search) search.value = v.query;
  const locBtn = root.querySelector('[data-bb-locate]');
  if (locBtn) locBtn.setAttribute('title', v.locPromptLabel);
  const radius = root.querySelector('[data-bb-radius] select');
  if (radius && document.activeElement !== radius) radius.value = v.radius;
  const radiusLabel = root.querySelector('[data-bb-radius]');
  if (radiusLabel) radiusLabel.setAttribute('title', v.radiusHint);
  const status = root.querySelector('[data-bb-toolbar-status]');
  if (status) status.textContent = v.statusCopy;
  const chips = root.querySelector('[data-bb-type-filters]');
  if (chips) {
    chips.innerHTML = v.typeFilters.map((chip, i) =>
      '<div data-bb-type-filter="" data-active="' + (chip.active ? 'true' : 'false')
      + '" role="button" tabindex="0" aria-pressed="' + (chip.active ? 'true' : 'false')
      + '" data-chip="' + i + '">' + esc(chip.label) + '</div>'
    ).join('');
    this._typeFilters = v.typeFilters;
  }
  const list = root.querySelector('[data-bb-locator-list]');
  if (list) list.setAttribute('data-sheet', v.sheetState);
  const handle = root.querySelector('[data-bb-sheet-handle]');
  if (handle) handle.setAttribute('aria-expanded', v.sheetExpanded);
  const scroll = root.querySelector('[data-bb-store-scroll]');
  if (scroll) {
    const listKey = [v.showFeatured, v.outOfRange, v.askPlace, v.noResults, v.storesFailed, v.showBeyond, v.showClearFilters, v.beyondLabel]
      .concat(v.visibleStores.map((s) => s.id)).join('|');
    if (this._listKey === listKey) {
      v.visibleStores.forEach((store) => {
        const row = scroll.querySelector('[data-store-id="' + String(store.id).replace(/"/g, '\\"') + '"]');
        if (!row) return;
        row.setAttribute('data-active', store.isActive);
        row.setAttribute('data-hover', store.isHover);
        row.setAttribute('aria-pressed', store.isActive);
        const dist = row.querySelector('[data-bb-store-dist]');
        if (dist) dist.textContent = store.distance || '';
      });
    } else {
    this._listKey = listKey;
    let html = '';
    if (v.showFeatured) {
      html += '<div data-bb-featured="" data-out-of-range="' + (v.outOfRange ? 'true' : 'false')
        + '" role="button" tabindex="0">'
        + '<div data-bb-label="" style="color: var(--bb-sage)">' + esc(v.featured.eyebrow) + '</div>'
        + '<div data-bb-featured-name="">' + esc(v.featured.name) + '</div>'
        + '<div data-bb-featured-line="">' + esc(v.featured.line) + '</div></div>';
    }
    if (v.outOfRange) {
      html += '<div data-bb-ask=""><div data-bb-ask-copy="">Want Brisa Bay in ' + esc(v.askPlace)
        + '? Tell us and we&rsquo;ll pass it to our distributors.</div>'
        + '<a data-bb-ask-link="" href="' + esc(v.askMailto) + '">Request a stockist</a></div>';
    }
    html += v.visibleStores.map((store) => {
      let actions = '<a data-bb-directions="" href="' + esc(store.directions)
        + '" target="_blank" rel="noopener">Get Directions</a>';
      if (store.hasPhone) {
        actions += '<a data-bb-row-link="" href="' + esc(store.tel) + '">' + esc(store.phone) + '</a>';
      }
      if (store.hasUrl) {
        actions += '<a data-bb-row-link="" href="' + esc(store.url) + '" target="_blank" rel="noopener">Website</a>';
      }
      return '<div data-bb-store-row="" data-store-id="' + esc(store.id)
        + '" data-active="' + store.isActive + '" data-hover="' + store.isHover
        + '" role="button" tabindex="0" aria-label="' + esc(store.label)
        + '" aria-pressed="' + store.isActive + '" style="animation-delay: ' + store.delay + '">'
        + '<div data-bb-store-main=""><div data-bb-store-name="">' + esc(store.name) + '</div>'
        + '<div data-bb-store-addr="">' + esc(store.address) + '<br>' + esc(store.city) + '</div>'
        + '<div data-bb-row-actions="">' + actions + '</div></div>'
        + '<div data-bb-store-side=""><div data-bb-store-index="" aria-hidden="true">' + esc(store.index)
        + '</div><div data-bb-store-dist="">' + esc(store.distance) + '</div></div></div>';
    }).join('');
    if (v.storesFailed) {
      html += '<div style="padding: clamp(20px, 1.9vw, 38px); font-size: clamp(15px, 1.05vw, 21px); color: rgba(87,84,74,0.75); text-wrap: pretty">The stockist list could not be loaded. Please refresh, or email <a href="mailto:'
        + esc(v.contactEmail) + '" style="color: var(--bb-red)">' + esc(v.contactEmail) + '</a> and we will point you to a shop.</div>';
    }
    if (v.noResults) {
      html += '<div style="padding: clamp(20px, 1.9vw, 38px); font-size: clamp(15px, 1.05vw, 21px); color: rgba(87,84,74,0.75); text-wrap: pretty"><div>Nothing nearby just yet. Ask your local shop to order Brisa Bay, or write <a href="mailto:'
        + esc(v.contactEmail) + '" style="color: var(--bb-red)">' + esc(v.contactEmail) + '</a>.</div>';
      if (v.showClearFilters) {
        html += '<div data-bb-empty-action="" role="button" tabindex="0">Clear filters</div>';
      }
      if (v.showBeyond) {
        html += '<div style="margin-top: clamp(18px, 1.6vw, 28px)"><div data-bb-label="">' + esc(v.beyondLabel) + '</div>'
          + v.beyondStores.map((far, i) =>
            '<div data-bb-beyond-row="" data-beyond="' + i + '" role="button" tabindex="0"><div data-bb-store-name="">'
            + esc(far.name) + '</div><div data-bb-featured-line="">' + esc(far.line) + '</div></div>'
          ).join('') + '</div>';
      }
      html += '</div>';
    }
    scroll.innerHTML = html;
    }
    this._featured = v.featured;
    this._beyondStores = v.beyondStores;
    this._onAskClick = v.onAskClick;
    this._clearFilters = v.clearFilters;
  }
  const map = root.querySelector('store-map');
  if (map) {
    map.setAttribute('storesjson', v.storesJson);
    map.setAttribute('active', v.activeId);
    map.setAttribute('holdview', v.holdView);
  }
  const areaSearch = root.querySelector('[data-bb-area-search]');
  if (areaSearch) {
    areaSearch.hidden = !v.showAreaSearch;
    areaSearch.textContent = v.areaSearchLabel;
  }
  const areaClear = root.querySelector('[data-bb-area-clear]');
  if (areaClear) {
    areaClear.hidden = !v.showAreaClear;
    areaClear.textContent = v.areaClearLabel;
  }
  this._vals = v;
};

LocatorApp.prototype.bindUi = function () {
  const root = this.root;
  root.addEventListener('input', (e) => {
    if (e.target.matches('[data-bb-search-wrap] input')) this._vals && this._vals.onQuery(e);
  });
  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-bb-radius] select')) this._vals && this._vals.onRadius(e);
  });
  root.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-bb-type-filter]');
    if (chip && this._typeFilters) {
      const i = Number(chip.getAttribute('data-chip'));
      this._typeFilters[i].onSelect();
      return;
    }
    if (e.target.closest('[data-bb-locate]')) { this._requestLocation(); return; }
    if (e.target.closest('[data-bb-sheet-handle]')) {
      this.setState({ sheetOpen: !this.state.sheetOpen });
      return;
    }
    if (e.target.closest('[data-bb-featured]')) { this._featured && this._featured.onSelect(); return; }
    const row = e.target.closest('[data-bb-store-row]');
    if (row && !e.target.closest('a')) { this.select(row.getAttribute('data-store-id')); return; }
    if (e.target.closest('[data-bb-empty-action]')) { this._clearFilters && this._clearFilters(); return; }
    const beyond = e.target.closest('[data-bb-beyond-row]');
    if (beyond && this._beyondStores) {
      const i = Number(beyond.getAttribute('data-beyond'));
      this._beyondStores[i].onSelect();
      return;
    }
    if (e.target.closest('[data-bb-area-search]')) { this._vals && this._vals.searchArea(); return; }
    if (e.target.closest('[data-bb-area-clear]')) { this._vals && this._vals.clearArea(); return; }
    if (e.target.closest('[data-bb-see-all]')) { this._vals && this._vals.resetView(); return; }
    if (e.target.closest('[data-bb-ask-link]')) { this._onAskClick && this._onAskClick(); }
  });
  root.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea, a')) return;
    const el = e.target.closest('[role="button"]');
    if (!el) return;
    this._activate(() => el.click())(e);
  });
  root.addEventListener('mouseover', (e) => {
    const row = e.target.closest('[data-bb-store-row]');
    if (!row) return;
    const id = row.getAttribute('data-store-id');
    if (this.state.hoverId === id) return;
    this.setState({ hoverId: id });
    const m = this._map();
    if (m && m.highlightStore) m.highlightStore(id);
  });
  root.addEventListener('mouseout', (e) => {
    const row = e.target.closest('[data-bb-store-row]');
    if (!row) return;
    if (row.contains(e.relatedTarget)) return;
    const id = row.getAttribute('data-store-id');
    if (this.state.hoverId !== id) return;
    this.setState({ hoverId: null });
    const m = this._map();
    if (m && m.highlightStore) m.highlightStore(null);
  });
  root.addEventListener('focusin', (e) => {
    const row = e.target.closest('[data-bb-store-row]');
    if (!row) return;
    const id = row.getAttribute('data-store-id');
    if (this.state.hoverId === id) return;
    this.setState({ hoverId: id });
    const m = this._map();
    if (m && m.highlightStore) m.highlightStore(id);
  });
};

const root = document.querySelector('[data-bb-locator]');
if (root) {
  const app = new LocatorApp();
  app.props = {};
  app.root = root;
  app.contactEmail = root.getAttribute('data-contact') || 'info@brisabay.com';
  app.bindUi();
  app.componentDidMount();
}

