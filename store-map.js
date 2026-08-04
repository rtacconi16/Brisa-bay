// <store-map> — Leaflet + OpenStreetMap stockist map for Brisa Bay.
// Loads Leaflet itself (pinned + hash-verified) so it never races its container.
(() => {
  let pending;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.integrity = 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H';
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.integrity = 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH';
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve(window.L);
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return pending;
  }

  const pin = (active, hover) => {
    const size = active ? 22 : (hover ? 18 : 14);
    const bg = active ? '#f5d732' : '#e6393a';
    const ring = hover && !active ? 'box-shadow:0 0 0 4px rgba(230,57,58,.28),0 1px 6px rgba(60,58,52,.35);' : 'box-shadow:0 1px 6px rgba(60,58,52,.35);';
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2px solid #eeeee4;${ring}transition:width .2s ease,height .2s ease,background .2s ease,box-shadow .2s ease"></div>`;
  };
  const userPin = () => `<div style="width:14px;height:14px;border-radius:50%;background:#3c3a34;border:2px solid #eeeee4;box-shadow:0 0 0 5px rgba(60,58,52,.16)"></div>`;
  const searchPin = () => `<div style="width:14px;height:14px;border-radius:50%;background:#60b98f;border:2px solid #eeeee4;box-shadow:0 0 0 5px rgba(96,185,143,.22)"></div>`;

  function milesBetween(a, b) {
    const R = 3958.8;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

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
      loadLeaflet().then((L) => this._init(L));
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
        scrollWheelZoom: true,
        attributionControl: true,
        tapTolerance: 18
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors', maxZoom: 19
      }).addTo(this._map);
      L.control.zoom({ position: 'bottomright' }).addTo(this._map);
      this._addLocateControl(L);
      this._map.getContainer().style.filter = 'saturate(0.42) brightness(1.04) contrast(0.96) sepia(0.08)';
      this._markers = {};
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
      requestAnimationFrame(() => this._map.invalidateSize());
      if (window.ResizeObserver) {
        this._ro = new ResizeObserver(() => {
          if (!this._map) return;
          this._map.invalidateSize({ animate: false });
        });
        this._ro.observe(this);
      }
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

    disconnectedCallback() { if (this._ro) this._ro.disconnect(); }

    /** Padding so pins stay clear of the list panel / mobile sheet / chrome. */
    _pad() {
      const w = this.clientWidth || 800;
      const h = this.clientHeight || 600;
      const mobile = w < 900;
      if (mobile) {
        // Sheet covers the lower portion of the viewport; keep pins in the upper map band
        return { paddingTopLeft: [28, 56], paddingBottomRight: [28, Math.round(h * 0.42)] };
      }
      return { paddingTopLeft: [36, 48], paddingBottomRight: [48, 48] };
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
      const dir = s.directions
        ? `<a href="${escapeHtml(s.directions)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:15px;color:#e6393a;text-decoration:none">Directions →</a>`
        : '';
      return `<div style="font-family:'Garamond Pro',Garamond,serif;color:#3c3a34;min-width:170px;padding:2px 0">
         <div style="font-size:17px;font-style:italic;font-weight:700;line-height:1.2;margin-bottom:4px">${escapeHtml(s.name)}</div>
         <div style="font-size:13px;color:#8a8578;margin-bottom:6px">${escapeHtml(s.type || '')} · ${escapeHtml(s.city || '')}</div>
         <div style="font-size:14px;line-height:1.35;color:#57544a">${escapeHtml(s.address)}</div>
         ${dist}
         ${dir}
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

    _draw({ fit = false } = {}) {
      const L = this._L;
      const list = spreadCoLocated(this.stores);
      const activeId = this.getAttribute('active');
      Object.values(this._markers || {}).forEach((m) => m.remove());
      this._markers = {};
      this._plotById = {};
      if (!list.length) {
        if (this._userLatLng) this._ensureUserMarker();
        else this._map.setView([26.2, -80.2], 8);
        return;
      }
      list.forEach((s) => {
        const isActive = activeId && String(s.id) === String(activeId);
        this._plotById[s.id] = [s._plotLat, s._plotLng];
        const m = L.marker([s._plotLat, s._plotLng], {
          title: s.name,
          zIndexOffset: isActive ? 1000 : 0,
          icon: this._iconFor(s.id),
          riseOnHover: true
        }).addTo(this._map);
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
        this._markers[s.id] = m;
      });
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
    }

    highlightStore(id) {
      this._hoverId = id || null;
      this._refreshIcons();
    }

    _fitSmart(list, { animate = true, includeAnchor = false, anchor = null } = {}) {
      if (!this._map || !this._L) return;
      this._map.invalidateSize({ animate: false });
      const pin = anchor || this._searchLatLng || this._userLatLng;
      const pad = this._pad();
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
        const opts = { ...pad, maxZoom: 12 };
        if (animate) this._map.flyToBounds(bounds, { ...opts, duration: 0.85 });
        else this._map.fitBounds(bounds, opts);
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
      const opts = { ...pad, maxZoom: points.length === 1 ? 13 : 11 };
      if (animate) this._map.flyToBounds(bounds, { ...opts, duration: 0.85 });
      else this._map.fitBounds(bounds, opts);
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
      const mobile = (this.clientWidth || 800) < 900;
      const done = () => {
        if (openPopup && this._markers[s.id]) this._markers[s.id].openPopup();
      };
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
          if (this._markers[s.id]) {
            this._map.panInside(this._markers[s.id].getLatLng(), {
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
