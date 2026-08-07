// <store-map> — Leaflet stockist map for Brisa Bay.
// Loads Leaflet itself so it never races its container. Every outside service
// it touches is configured in locator-config.js.
(() => {
  let pending;

  /** Read live rather than cached: visitors change this setting mid-session. */
  const reduceMotion = () => !!(window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const CFG = (window.BB_LOCATOR_CONFIG) || {};
  const ASSETS = CFG.assets || {};
  const TILES = CFG.tiles || {};

  function addStyle(href) {
    if (!href) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function addScript(src) {
    return new Promise((resolve, reject) => {
      if (!src) { reject(new Error('no src')); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  // Assets are served from our own origin, so no SRI or crossorigin: integrity
  // guards a third party changing the bytes under us, and there is no third
  // party here any more.
  function loadLeaflet() {
    if (window.L && window.L.markerClusterGroup) return Promise.resolve(window.L);
    if (pending) return pending;
    pending = (async () => {
      if (!window.L) {
        addStyle(ASSETS.leafletCss);
        await addScript(ASSETS.leafletJs);
      }
      if (!window.L) throw new Error('Leaflet did not initialise');
      // Clustering is a progressive enhancement: if the plugin fails to load,
      // the map still works, just with every pin drawn individually.
      try {
        addStyle(ASSETS.clusterCss);
        await addScript(ASSETS.clusterJs);
      } catch (e) { /* no clustering, still a map */ }
      return window.L;
    })();
    return pending;
  }

  const pin = (active, hover) => {
    const size = active ? 22 : (hover ? 18 : 14);
    const bg = active ? '#f5d732' : '#e6393a';
    const ring = hover && !active ? 'box-shadow:0 0 0 4px rgba(230,57,58,.28),0 1px 6px rgba(60,58,52,.35);' : 'box-shadow:0 1px 6px rgba(60,58,52,.35);';
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2px solid #eeeee4;${ring}transition:width .2s ease,height .2s ease,background .2s ease,box-shadow .2s ease"></div>`;
  };
  /** Cluster bubbles in the site palette — a default-styled plugin widget would
     read as something bolted on. Size grows with count, but only a little. */
  const clusterPin = (count) => {
    const size = count < 10 ? 34 : (count < 50 ? 40 : 46);
    const font = count < 10 ? 15 : (count < 50 ? 16 : 17);
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#e6393a;border:2px solid #eeeee4;box-shadow:0 1px 8px rgba(60,58,52,.35);display:flex;align-items:center;justify-content:center;font-family:'Garamond Pro',Garamond,serif;font-size:${font}px;color:#eeeee4;font-variant-numeric:tabular-nums">${count}</div>`;
  };
  const userPin = () => `<div style="width:14px;height:14px;border-radius:50%;background:#3c3a34;border:2px solid #eeeee4;box-shadow:0 0 0 5px rgba(60,58,52,.16)"></div>`;
  const searchPin = () => `<div style="width:14px;height:14px;border-radius:50%;background:#60b98f;border:2px solid #eeeee4;box-shadow:0 0 0 5px rgba(96,185,143,.22)"></div>`;

  // Fallback view: the densest part of the stockist footprint. Used before the
  // container is measurable and whenever a fit cannot be computed.
  const HOME_VIEW = { center: [26.6, -80.4], zoom: 8 };

  // Shared with the page component via locator-util.js; falls back to a local
  // copy if this component is ever used without it.
  const milesBetween = (window.BBLocator && window.BBLocator.milesBetween) || function (a, b) {
    const R = 3958.8;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  };

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Prefer the densest geographic cluster when stores span the whole country. */
  function densestCluster(list, radiusDeg) {
    if (list.length <= 2) return list;
    let best = list;
    let bestCount = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const near = [];
      for (let j = 0; j < list.length; j++) {
        const s = list[j];
        if (Math.hypot(s.lat - c.lat, s.lng - c.lng) <= radiusDeg) near.push(s);
      }
      if (near.length > bestCount) {
        bestCount = near.length;
        best = near;
      }
    }
    return best;
  }

  /** Nudge pins that share the same coordinates so they are all tappable. */
  function spreadCoLocated(list) {
    const groups = new Map();
    list.forEach((s) => {
      const key = s.lat.toFixed(5) + ',' + s.lng.toFixed(5);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    });
    const out = [];
    groups.forEach((group) => {
      if (group.length === 1) {
        out.push({ ...group[0], _plotLat: group[0].lat, _plotLng: group[0].lng });
        return;
      }
      const n = group.length;
      const radius = 0.00018 * Math.min(n, 6); // ~20m
      group.forEach((s, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        out.push({
          ...s,
          _plotLat: s.lat + Math.sin(angle) * radius,
          _plotLng: s.lng + Math.cos(angle) * radius
        });
      });
    });
    return out;
  }

  class StoreMap extends HTMLElement {
    static get observedAttributes() { return ['storesjson', 'stores-json', 'active']; }

    connectedCallback() {
      if (this._built) return;
      this._built = true;
      this.style.cssText = 'display:block;position:absolute;inset:0;width:100%;height:100%';
      this._el = document.createElement('div');
      this._el.style.cssText = 'position:absolute;inset:0;background:#dfdfd6';
      this._tone = document.createElement('div');
      this._tone.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:#e9d9a8;mix-blend-mode:multiply;opacity:.28;z-index:400';
      this.appendChild(this._el);
      this.appendChild(this._tone);
      this._hoverId = null;
      loadLeaflet()
        .then((L) => this._init(L))
        .catch((err) => this._failGracefully(err));
    }

    /** The map is an enhancement, not the product: the list beside it already
       does everything except show where things are. If Leaflet cannot load —
       blocked by an extension, a corporate proxy, or an offline visitor — say
       so plainly instead of leaving a blank rectangle. */
    _failGracefully(err) {
      if (this._failed) return;
      this._failed = true;
      if (this._tone) this._tone.style.display = 'none';
      this._el.innerHTML = '';
      this._el.style.display = 'flex';
      this._el.style.alignItems = 'center';
      this._el.style.justifyContent = 'center';
      this._el.style.padding = '24px';
      this._el.style.boxSizing = 'border-box';
      const msg = document.createElement('div');
      msg.setAttribute('role', 'status');
      msg.style.cssText = "max-width:34ch;text-align:center;font-family:'Garamond Pro',Garamond,serif;"
        + 'color:#57544a;font-size:clamp(15px,1.05vw,20px);line-height:1.5';
      msg.innerHTML = '<div style="font-size:1.15em;color:#3c3a34;margin-bottom:8px">Map unavailable</div>'
        + '<div>Every stockist is still listed alongside, with addresses and directions.</div>';
      this._el.appendChild(msg);
      this.dispatchEvent(new CustomEvent('store-map-failed', { bubbles: true }));
      if (window.console && console.warn) console.warn('[store-map]', err);
    }

    attributeChangedCallback(name) {
      if (!this._map) return;
      if (name === 'active') {
        const id = this.getAttribute('active');
        if (id) this.focusStore(id, true);
        else this._clearActive(true);
        return;
      }
      const ids = this.stores.map((s) => s.id).join('|');
      const fit = ids !== this._lastStoreIds;
      this._lastStoreIds = ids;
      this._draw({ fit });
    }

    get stores() {
      try { return JSON.parse(this.getAttribute('storesjson') || this.getAttribute('stores-json') || '[]'); }
      catch (e) { return []; }
    }

    _init(L) {
      this._L = L;
      this._map = L.map(this._el, {
        zoomControl: false,
        minZoom: TILES.minZoom || 0,
        // The locator fills the viewport with a footer below it. A map that
        // eats the wheel traps the page; require a modifier, as maps embedded
        // in scrolling pages conventionally do.
        scrollWheelZoom: false,
        attributionControl: true,
        tapTolerance: 18
      });
      L.tileLayer(TILES.url, {
        attribution: TILES.attribution,
        maxZoom: TILES.maxZoom || 19,
        minZoom: TILES.minZoom || 0
      }).addTo(this._map);
      // A provisional view before anything else. Until a map is _loaded,
      // invalidateSize() is a no-op, so Leaflet would keep serving whatever
      // container size it cached at construction — often 0 during first layout,
      // which is what made every subsequent fit calculation nonsense.
      this._map.setView(HOME_VIEW.center, HOME_VIEW.zoom);
      L.control.zoom({ position: 'bottomright' }).addTo(this._map);
      this._addLocateControl(L);
      const container = this._map.getContainer();
      container.style.filter = 'saturate(0.42) brightness(1.04) contrast(0.96) sepia(0.08)';
      // Focusable so it can be panned and zoomed from the keyboard, and named
      // so a screen reader can say what it is and where the real content is.
      container.setAttribute('role', 'application');
      container.setAttribute('aria-label',
        'Map of Brisa Bay stockists. Arrow keys pan, plus and minus zoom. '
        + 'The same stockists are listed as buttons alongside this map.');
      this._markers = {};
      if (L.markerClusterGroup) {
        this._cluster = L.markerClusterGroup({
          chunkedLoading: true,
          maxClusterRadius: 45,
          // Below focusStore's target zoom, so selecting a store always lands on
          // an individual pin rather than a bubble.
          disableClusteringAtZoom: 13,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          iconCreateFunction: (c) => L.divIcon({
            html: clusterPin(c.getChildCount()),
            className: '',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
          })
        });
        this._map.addLayer(this._cluster);
        // Cluster bubbles are Markers the plugin builds itself, so they take
        // Leaflet's default keyboard:true and land in the tab order. Sweep them
        // out whenever the cluster layer redraws — with real markers already
        // opted out, anything still carrying a tabindex here is a bubble.
        const sweep = () => this._stripMarkerTabIndex();
        this._cluster.on('animationend', sweep);
        this._map.on('zoomend moveend', sweep);
      }
      this._map.on('click', () => {
        this.dispatchEvent(new CustomEvent('store-deselect', { bubbles: true }));
      });
      this._draw({ fit: true });
      if (this._pendingUser) {
        const p = this._pendingUser;
        this._pendingUser = null;
        this.setUserLocation(p.lat, p.lng, p.opts);
      }
      if (this._pendingSearch) {
        const p = this._pendingSearch;
        this._pendingSearch = null;
        this.setSearchLocation(p.lat, p.lng, p.opts);
      }
      requestAnimationFrame(() => {
        if (!this._map) return;
        this._map.invalidateSize();
        this._flushFit();
      });
      this._setupWheelZoom();

      // Once the visitor has touched the map, its view is theirs — never re-fit
      // underneath them.
      this._userMoved = false;
      const markUserMoved = () => { this._userMoved = true; };
      ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach((ev) => {
        this._el.addEventListener(ev, markUserMoved, { passive: true });
      });

      if (window.ResizeObserver) {
        this._ro = new ResizeObserver(() => {
          if (!this._map) return;
          this._map.invalidateSize({ animate: false });
          if (this._flushFit()) return;
          // A fit computed against a container that has since changed size is
          // just a stale fit. Replay it while the view is still ours.
          if (this._userMoved || !this._lastFit || !this._sizeReady()) return;
          const w = this._el.clientWidth;
          const h = this._el.clientHeight;
          if (Math.abs(w - this._fitW) < 40 && Math.abs(h - this._fitH) < 40) return;
          const { list, opts } = this._lastFit;
          this._fitSmart(list, { ...opts, animate: false });
        });
        this._ro.observe(this);
      }
      // Crossing the stylesheet's breakpoint changes _pad(), so the current
      // view needs re-fitting to the new safe area.
      if (window.matchMedia) {
        this._mq = window.matchMedia('(max-width: 900px)');
        this._onMq = () => {
          if (!this._map) return;
          this._map.invalidateSize({ animate: false });
          this.resetView();
        };
        if (this._mq.addEventListener) this._mq.addEventListener('change', this._onMq);
        else if (this._mq.addListener) this._mq.addListener(this._onMq);
      }
    }

    /** Wheel zooms only with a modifier held; a bare wheel scrolls the page and
       says so once, briefly. Pinch and trackpad-pinch arrive as ctrlKey wheel
       events, so they keep working untouched. */
    _setupWheelZoom() {
      const hint = document.createElement('div');
      hint.style.cssText = 'position:absolute;inset:0;z-index:450;display:flex;align-items:center;justify-content:center;'
        + 'background:rgba(60,58,52,0.42);color:#eeeee4;font-family:\'Garamond Pro\',Garamond,serif;font-size:19px;'
        + 'letter-spacing:0.03em;pointer-events:none;opacity:0;transition:opacity .25s';
      const mod = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘' : 'Ctrl';
      hint.textContent = 'Hold ' + mod + ' and scroll to zoom';
      this.appendChild(hint);
      this._wheelHint = hint;

      this._el.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
          if (!this._map.scrollWheelZoom.enabled()) this._map.scrollWheelZoom.enable();
          return;
        }
        if (this._map.scrollWheelZoom.enabled()) this._map.scrollWheelZoom.disable();
        hint.style.opacity = '1';
        clearTimeout(this._hintTimer);
        this._hintTimer = setTimeout(() => { hint.style.opacity = '0'; }, 1100);
      }, { passive: true });
    }

    _addLocateControl(L) {
      const self = this;
      const Locate = L.Control.extend({
        options: { position: 'bottomright' },
        onAdd() {
          const wrap = L.DomUtil.create('div', 'leaflet-bar bb-locate-control');
          const btn = L.DomUtil.create('a', '', wrap);
          btn.href = '#';
          btn.title = 'Center on my location';
          btn.setAttribute('role', 'button');
          btn.setAttribute('aria-label', 'Center on my location');
          btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>';
          L.DomEvent.disableClickPropagation(wrap);
          L.DomEvent.on(btn, 'click', (e) => {
            L.DomEvent.preventDefault(e);
            if (self._userLatLng) self.focusNearby({ animate: true });
            else self.dispatchEvent(new CustomEvent('store-locate', { bubbles: true }));
          });
          return wrap;
        }
      });
      this._map.addControl(new Locate());
    }

    disconnectedCallback() {
      clearTimeout(this._fitTimer);
      clearTimeout(this._hintTimer);
      if (this._ro) this._ro.disconnect();
      if (this._mq && this._onMq) {
        if (this._mq.removeEventListener) this._mq.removeEventListener('change', this._onMq);
        else if (this._mq.removeListener) this._mq.removeListener(this._onMq);
      }
    }

    /** True when the stylesheet has stacked the map above the sheet.
       Must track the CSS media query, not the map element's own width: the map
       is 66% of the row, so on a 1280px desktop it measures ~845px and any
       element-width test would wrongly report mobile. */
    _isNarrow() {
      if (typeof window === 'undefined') return false;
      if (window.matchMedia) return window.matchMedia('(max-width: 900px)').matches;
      return (window.innerWidth || 1280) <= 900;
    }

    /** Padding so pins stay clear of the list panel / mobile sheet / chrome.
       Never allows padding to consume more than 60% of an axis — beyond that
       fitBounds is working with a negative viewport and returns nonsense. */
    _pad() {
      const h = this.clientHeight || 600;
      const raw = this._isNarrow()
        // Sheet covers the lower portion of the viewport; keep pins in the upper map band
        ? { paddingTopLeft: [28, 56], paddingBottomRight: [28, Math.round(h * 0.42)] }
        : { paddingTopLeft: [36, 48], paddingBottomRight: [48, 48] };
      return this._clampPad(raw);
    }

    _clampPad(pad) {
      const size = this._map ? this._map.getSize() : null;
      const w = (size && size.x) || this.clientWidth || 800;
      const h = (size && size.y) || this.clientHeight || 600;
      const tl = pad.paddingTopLeft.slice();
      const br = pad.paddingBottomRight.slice();
      const fit = (i, limit) => {
        const total = tl[i] + br[i];
        const max = limit * 0.6;
        if (total <= max || total <= 0) return;
        const scale = max / total;
        tl[i] = Math.floor(tl[i] * scale);
        br[i] = Math.floor(br[i] * scale);
      };
      fit(0, w);
      fit(1, h);
      return { paddingTopLeft: tl, paddingBottomRight: br };
    }

    _popupOpts() {
      const pad = this._pad();
      return {
        closeButton: false,
        offset: [0, -8],
        maxWidth: 260,
        autoPan: true,
        autoPanPaddingTopLeft: pad.paddingTopLeft,
        autoPanPaddingBottomRight: pad.paddingBottomRight
      };
    }

    _popupHtml(s) {
      const dist = s.distance
        ? `<div style="margin-top:4px;font-size:13px;letter-spacing:.04em;color:#8a8578">${escapeHtml(s.distance)}</div>`
        : '';
      const linkCss = 'font-size:15px;color:#e6393a;text-decoration:none';
      const dir = s.directions
        ? `<a href="${escapeHtml(s.directions)}" target="_blank" rel="noopener" style="${linkCss}">Directions →</a>`
        : '';
      const tel = s.tel
        ? `<a href="${escapeHtml(s.tel)}" style="${linkCss}">${escapeHtml(s.phone)}</a>`
        : '';
      const site = s.url
        ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" style="${linkCss}">Website</a>`
        : '';
      const actions = [dir, tel, site].filter(Boolean);
      const actionRow = actions.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">${actions.join('')}</div>`
        : '';
      return `<div style="font-family:'Garamond Pro',Garamond,serif;color:#3c3a34;min-width:170px;padding:2px 0">
         <div style="font-size:17px;font-style:italic;font-weight:700;line-height:1.2;margin-bottom:4px">${escapeHtml(s.name)}</div>
         <div style="font-size:13px;color:#8a8578;margin-bottom:6px">${escapeHtml(s.type || '')} · ${escapeHtml(s.city || '')}</div>
         <div style="font-size:14px;line-height:1.35;color:#57544a">${escapeHtml(s.address)}</div>
         ${dist}
         ${actionRow}
       </div>`;
    }

    _iconFor(id) {
      const activeId = this.getAttribute('active');
      const active = activeId && String(id) === String(activeId);
      const hover = this._hoverId && String(id) === String(this._hoverId);
      const size = active ? 26 : (hover ? 22 : 20);
      return this._L.divIcon({
        html: pin(active, hover),
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });
    }

    _refreshIcons() {
      Object.keys(this._markers || {}).forEach((id) => {
        const m = this._markers[id];
        if (!m) return;
        m.setIcon(this._iconFor(id));
        const activeId = this.getAttribute('active');
        const active = activeId && String(id) === String(activeId);
        const hover = this._hoverId && String(id) === String(this._hoverId);
        m.setZIndexOffset(active ? 1000 : (hover ? 800 : 0));
      });
    }

    _clearActive(closePopups) {
      this._refreshIcons();
      if (closePopups) Object.values(this._markers || {}).forEach((m) => m.closePopup());
    }

    _stripMarkerTabIndex() {
      if (!this._el) return;
      const nodes = this._el.querySelectorAll('.leaflet-marker-icon[tabindex]');
      for (let i = 0; i < nodes.length; i++) nodes[i].removeAttribute('tabindex');
    }

    _addMarkers(markers) {
      if (this._cluster) this._cluster.addLayers(markers);
      else markers.forEach((m) => m.addTo(this._map));
      this._stripMarkerTabIndex();
    }

    _removeMarkers(markers) {
      if (this._cluster) this._cluster.removeLayers(markers);
      else markers.forEach((m) => m.remove());
    }

    _draw({ fit = false } = {}) {
      const L = this._L;
      const list = spreadCoLocated(this.stores);
      const activeId = this.getAttribute('active');
      this._markers = this._markers || {};
      this._plotById = {};

      // Diff rather than rebuild. This runs on every keystroke and filter
      // change; tearing down a hundred markers each time dropped whatever
      // popup was open and made typing visibly stutter.
      const nextIds = new Set(list.map((s) => String(s.id)));
      const gone = Object.keys(this._markers).filter((id) => !nextIds.has(id));
      if (gone.length) {
        this._removeMarkers(gone.map((id) => this._markers[id]));
        gone.forEach((id) => { delete this._markers[id]; });
      }

      if (!list.length) {
        if (this._userLatLng) this._ensureUserMarker();
        else if (!fit) this._map.setView(HOME_VIEW.center, HOME_VIEW.zoom);
        return;
      }

      const added = [];
      list.forEach((s) => {
        const id = String(s.id);
        const isActive = activeId && id === String(activeId);
        this._plotById[id] = [s._plotLat, s._plotLng];
        const existing = this._markers[id];
        if (existing) {
          existing.setLatLng([s._plotLat, s._plotLng]);
          // Distance copy changes whenever the reference location moves.
          existing.setPopupContent(this._popupHtml(s));
          existing.setIcon(this._iconFor(id));
          existing.setZIndexOffset(isActive ? 1000 : 0);
          return;
        }
        const m = L.marker([s._plotLat, s._plotLng], {
          title: s.name,
          zIndexOffset: isActive ? 1000 : 0,
          icon: this._iconFor(id),
          riseOnHover: true,
          // The stockist list beside the map is the accessible representation:
          // it is ordered, labelled and fully operable. Leaflet's default puts
          // every marker in the tab order too, which makes a keyboard user
          // traverse the same hundred stores a second time with only title
          // text to go on.
          keyboard: false
        });
        m.bindPopup(this._popupHtml(s), this._popupOpts());
        m.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          this.dispatchEvent(new CustomEvent('store-select', { bubbles: true, detail: s.id }));
        });
        m.on('mouseover', () => {
          this.highlightStore(s.id);
          this.dispatchEvent(new CustomEvent('store-hover', { bubbles: true, detail: s.id }));
        });
        m.on('mouseout', () => {
          if (this._hoverId === s.id) {
            this.highlightStore(null);
            this.dispatchEvent(new CustomEvent('store-hover', { bubbles: true, detail: null }));
          }
        });
        this._markers[id] = m;
        added.push(m);
      });
      if (added.length) this._addMarkers(added);
      if (this._userLatLng) this._ensureUserMarker();
      if (this._searchLatLng) this._ensureSearchMarker();
      if (fit) {
        const anchor = this._searchLatLng || this._userLatLng;
        this._fitSmart(this.stores, { animate: false, includeAnchor: !!anchor, anchor });
      } else if (activeId && this._markers[activeId]) {
        // Keep selection visible after filter redraws
        this.focusStore(activeId, false);
      }
    }

    _ensureUserMarker() {
      if (!this._map || !this._L || !this._userLatLng) return;
      const [lat, lng] = this._userLatLng;
      if (this._userMarker) this._userMarker.remove();
      this._userMarker = this._L.marker([lat, lng], {
        title: 'Your location',
        zIndexOffset: 2000,
        icon: this._L.divIcon({ html: userPin(), className: '', iconSize: [24, 24], iconAnchor: [12, 12] })
      }).addTo(this._map);
      this._userMarker.bindPopup(
        `<div style="font-family:'Garamond Pro',Garamond,serif;color:#3c3a34;font-size:15px">You are here</div>`,
        this._popupOpts()
      );
    }

    _ensureSearchMarker() {
      if (!this._map || !this._L || !this._searchLatLng) return;
      const [lat, lng] = this._searchLatLng;
      if (this._searchMarker) this._searchMarker.remove();
      this._searchMarker = this._L.marker([lat, lng], {
        title: 'Searched location',
        zIndexOffset: 1900,
        icon: this._L.divIcon({ html: searchPin(), className: '', iconSize: [24, 24], iconAnchor: [12, 12] })
      }).addTo(this._map);
      this._searchMarker.bindPopup(
        `<div style="font-family:'Garamond Pro',Garamond,serif;color:#3c3a34;font-size:15px">Searched area</div>`,
        this._popupOpts()
      );
    }

    setUserLocation(lat, lng, opts = {}) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (!this._map || !this._L) {
        this._pendingUser = { lat, lng, opts };
        return;
      }
      this._userLatLng = [lat, lng];
      this._ensureUserMarker();
      this._drawRadius();
      if (opts.fit !== false) this.focusNearby({ animate: opts.animate !== false });
    }

    setSearchLocation(lat, lng, opts = {}) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (!this._map || !this._L) {
        this._pendingSearch = { lat, lng, opts };
        return;
      }
      this._searchLatLng = [lat, lng];
      this._ensureSearchMarker();
      this._drawRadius();
      if (opts.fit !== false) {
        this._fitSmart(this.stores, {
          animate: opts.animate !== false,
          includeAnchor: true,
          anchor: this._searchLatLng
        });
      }
    }

    clearSearchLocation() {
      this._searchLatLng = null;
      this._pendingSearch = null;
      if (this._searchMarker) {
        this._searchMarker.remove();
        this._searchMarker = null;
      }
      this._drawRadius();
    }

    /** Show the chosen radius as an area, so "25 mi" is something you can see
       rather than an invisible rule the list silently obeys. */
    setRadius(miles) {
      const next = Number(miles) || 0;
      if (next === this._radiusMi) return;
      this._radiusMi = next;
      this._drawRadius();
      this._fitSmart(this.stores, {
        animate: true,
        includeAnchor: true,
        anchor: this._searchLatLng || this._userLatLng
      });
    }

    _drawRadius() {
      if (!this._map || !this._L) return;
      if (this._radiusCircle) {
        this._radiusCircle.remove();
        this._radiusCircle = null;
      }
      const c = this._searchLatLng || this._userLatLng;
      if (!c || !this._radiusMi) return;
      this._radiusCircle = this._L.circle(c, {
        radius: this._radiusMi * 1609.34,
        interactive: false,
        color: '#e6393a',
        weight: 1,
        opacity: 0.45,
        fillColor: '#e6393a',
        fillOpacity: 0.05
      }).addTo(this._map);
    }

    highlightStore(id) {
      this._hoverId = id || null;
      this._refreshIcons();
    }

    /** Leaflet's fit maths needs a laid-out container; before that getBoundsZoom
       returns non-finite garbage that the maxZoom clamp happily turns into a
       plausible-looking wrong zoom. */
    _sizeReady() {
      if (!this._map || !this._el) return false;
      // Both measurements must agree. The element is the truth, but every fit
      // calculation runs on map.getSize(), which is a cache that can still be
      // holding a zero from before first layout.
      if (this._el.clientWidth < 120 || this._el.clientHeight < 120) return false;
      const s = this._map.getSize();
      return s.x >= 120 && s.y >= 120;
    }

    _flushFit() {
      if (!this._pendingFit || !this._sizeReady()) return false;
      const { list, opts } = this._pendingFit;
      this._pendingFit = null;
      this._fitSmart(list, { ...opts, animate: false });
      return true;
    }

    /** The ResizeObserver covers most late layouts, but it only fires on an
       actual size change — if the container is measurable a beat after we ask
       and never changes again, no callback arrives. Poll briefly as a backstop. */
    _scheduleFitFlush() {
      clearTimeout(this._fitTimer);
      this._fitTries = 0;
      const tick = () => {
        if (!this._pendingFit || !this._map) return;
        this._map.invalidateSize({ animate: false });
        if (this._flushFit()) return;
        if (++this._fitTries >= 24) return;
        this._fitTimer = setTimeout(tick, 125);
      };
      this._fitTimer = setTimeout(tick, 60);
    }

    /** fitBounds, but the zoom is computed and sanity-checked first so a bad
       measurement can never be mistaken for "zoom all the way to maxZoom". */
    _applyFit(bounds, { animate, maxZoom, pad }) {
      const map = this._map;
      const padTotal = this._L.point(pad.paddingTopLeft).add(this._L.point(pad.paddingBottomRight));
      let zoom = map.getBoundsZoom(bounds, false, padTotal);
      if (!Number.isFinite(zoom)) zoom = map.getBoundsZoom(bounds, false);
      if (!Number.isFinite(zoom)) zoom = 9;
      const opts = { ...pad, maxZoom: Math.min(zoom, maxZoom) };
      if (animate && !reduceMotion()) map.flyToBounds(bounds, { ...opts, duration: 0.85 });
      else map.fitBounds(bounds, { ...opts, animate: false });
    }

    _fitSmart(list, opts = {}) {
      if (!this._map || !this._L) return;
      this._map.invalidateSize({ animate: false });
      if (!this._sizeReady()) {
        // Container not measured yet — replay once it is.
        this._pendingFit = { list, opts };
        this._scheduleFitFlush();
        return;
      }
      this._pendingFit = null;
      clearTimeout(this._fitTimer);
      // Remember what we fitted and at what size, so a later resize can replay it.
      this._lastFit = { list, opts };
      this._fitW = this._el.clientWidth;
      this._fitH = this._el.clientHeight;

      const { animate = true, includeAnchor = false, anchor = null } = opts;
      const pin = anchor || this._searchLatLng || this._userLatLng;
      const pad = this._pad();
      // While a radius is set, that circle *is* the area under discussion — every
      // fit shows it, so the marker redraw that follows a filter change cannot
      // quietly reframe the map somewhere else.
      if (this._radiusCircle) {
        this._applyFit(this._radiusCircle.getBounds(), { animate, maxZoom: 13, pad });
        return;
      }
      if (!list.length) {
        if (pin) this._map.setView(pin, 11);
        return;
      }

      let points = list.slice();
      if (includeAnchor && pin) {
        const [ulat, ulng] = pin;
        const ranked = list
          .map((s) => ({ s, mi: milesBetween({ lat: ulat, lng: ulng }, s) }))
          .sort((a, b) => a.mi - b.mi);
        const nearby = ranked.filter((x) => x.mi <= 40).slice(0, 8);
        points = (nearby.length ? nearby : ranked.slice(0, 5)).map((x) => x.s);
        const bounds = this._L.latLngBounds([[ulat, ulng], ...points.map((s) => [s.lat, s.lng])]);
        this._applyFit(bounds, { animate, maxZoom: 12, pad });
        return;
      }

      const full = this._L.latLngBounds(points.map((s) => [s.lat, s.lng]));
      const ne = full.getNorthEast();
      const sw = full.getSouthWest();
      const latSpan = ne.lat - sw.lat;
      const lngSpan = ne.lng - sw.lng;
      if (points.length > 3 && (latSpan > 5 || lngSpan > 8)) {
        points = densestCluster(points, 1.6);
      }
      const bounds = this._L.latLngBounds(points.map((s) => [s.lat, s.lng]));
      this._applyFit(bounds, { animate, maxZoom: points.length === 1 ? 13 : 11, pad });
    }

    focusNearby({ animate = true } = {}) {
      this._fitSmart(this.stores, {
        animate,
        includeAnchor: true,
        anchor: this._searchLatLng || this._userLatLng
      });
    }

    focusStore(id, openPopup) {
      if (!this._map) return;
      this._refreshIcons();
      const s = this.stores.find((x) => String(x.id) === String(id));
      if (!s) return;
      const plot = (this._plotById && this._plotById[s.id]) || [s.lat, s.lng];
      const targetZoom = Math.max(this._map.getZoom(), 13);
      const pad = this._pad();
      // Offset center upward on mobile so the pin sits above the sheet
      const mobile = this._isNarrow();
      const done = () => {
        const marker = this._markers[String(s.id)];
        if (!openPopup || !marker) return;
        // Below disableClusteringAtZoom the pin stands alone, but a spiderfied
        // or still-clustered marker has no popup anchor until it is revealed.
        if (this._cluster && !this._map.hasLayer(marker) && this._cluster.zoomToShowLayer) {
          this._cluster.zoomToShowLayer(marker, () => marker.openPopup());
          return;
        }
        marker.openPopup();
      };
      // Reduced motion: jump straight there and open the popup, no flight.
      if (reduceMotion()) {
        if (mobile) {
          this._map.setView(plot, targetZoom, { animate: false });
          const p = this._map.latLngToContainerPoint(plot);
          const shifted = this._map.containerPointToLatLng([p.x, p.y + Math.round(this.clientHeight * 0.16)]);
          this._map.panTo(shifted, { animate: false });
        } else {
          this._map.setView(plot, targetZoom, { animate: false });
          const marker = this._markers[String(s.id)];
          if (marker) {
            this._map.panInside(marker.getLatLng(), {
              paddingTopLeft: pad.paddingTopLeft,
              paddingBottomRight: pad.paddingBottomRight,
              animate: false
            });
          }
        }
        done();
        return;
      }
      if (mobile) {
        this._map.flyTo(plot, targetZoom, { duration: 0.7 });
        this._map.once('moveend', () => {
          const p = this._map.latLngToContainerPoint(plot);
          const shifted = this._map.containerPointToLatLng([p.x, p.y + Math.round(this.clientHeight * 0.16)]);
          this._map.panTo(shifted, { animate: true, duration: 0.35 });
          setTimeout(done, 380);
        });
      } else {
        this._map.flyTo(plot, targetZoom, { duration: 0.75 });
        this._map.once('moveend', done);
        // Keep pin clear of edges
        setTimeout(() => {
          if (this._markers[String(s.id)]) {
            this._map.panInside(this._markers[String(s.id)].getLatLng(), {
              paddingTopLeft: pad.paddingTopLeft,
              paddingBottomRight: pad.paddingBottomRight,
              animate: true
            });
          }
        }, 780);
      }
    }

    resetView() {
      if (!this._map) return;
      this._hoverId = null;
      this._refreshIcons();
      Object.values(this._markers || {}).forEach((m) => m.closePopup());
      const anchor = this._searchLatLng || this._userLatLng;
      this._fitSmart(this.stores, { animate: true, includeAnchor: !!anchor, anchor });
    }
  }

  if (!customElements.get('store-map')) customElements.define('store-map', StoreMap);
})();
