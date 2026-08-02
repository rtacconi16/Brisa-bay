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

  const pin = (active) => `<div style="width:${active ? 26 : 18}px;height:${active ? 26 : 18}px;border-radius:50%;background:${active ? '#f5d732' : '#e6393a'};border:3px solid #eeeee4;box-shadow:0 2px 8px rgba(60,58,52,.45);transition:all .2s"></div>`;

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
      loadLeaflet().then((L) => this._init(L));
    }

    attributeChangedCallback(name) {
      if (name === 'active') this.focusStore(this.getAttribute('active'), true);
      else if (this._map) this._draw();
    }

    get stores() {
      try { return JSON.parse(this.getAttribute('storesjson') || this.getAttribute('stores-json') || '[]'); }
      catch (e) { return []; }
    }

    _init(L) {
      this._L = L;
      this._map = L.map(this._el, { zoomControl: false, scrollWheelZoom: true, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors', maxZoom: 19
      }).addTo(this._map);
      L.control.zoom({ position: 'bottomright' }).addTo(this._map);
      this._map.getContainer().style.filter = 'saturate(0.5) brightness(1.05) contrast(0.95)';
      this._markers = {};
      this._draw();
      requestAnimationFrame(() => this._map.invalidateSize());
      if (window.ResizeObserver) {
        this._ro = new ResizeObserver(() => { if (this._map) this._map.invalidateSize(); });
        this._ro.observe(this);
      }
    }

    disconnectedCallback() { if (this._ro) this._ro.disconnect(); }

    _draw() {
      const L = this._L, list = this.stores;
      Object.values(this._markers || {}).forEach((m) => m.remove());
      this._markers = {};
      if (!list.length) return;
      list.forEach((s) => {
        const m = L.marker([s.lat, s.lng], {
          title: s.name,
          icon: L.divIcon({ html: pin(false), className: '', iconSize: [24, 24], iconAnchor: [12, 12] })
        }).addTo(this._map);
        m.bindPopup(
          `<div style="font-family:'Garamond Pro',Garamond,serif;color:#3c3a34;min-width:180px">
             <div style="font-size:18px;font-style:italic;font-weight:700;margin-bottom:2px">${s.name}</div>
             <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#8a8578;margin-bottom:6px">${s.type}</div>
             <div style="font-size:15px;line-height:1.35">${s.address}<br>${s.city}</div>
           </div>`,
          { closeButton: false, offset: [0, -6] }
        );
        m.on('click', () => {
          this.dispatchEvent(new CustomEvent('store-select', { bubbles: true, detail: s.id }));
        });
        this._markers[s.id] = m;
      });
      this._map.fitBounds(L.latLngBounds(list.map((s) => [s.lat, s.lng])), { padding: [70, 70] });
    }

    focusStore(id, openPopup) {
      if (!this._map) return;
      Object.entries(this._markers || {}).forEach(([key, m]) => {
        const active = key === String(id);
        m.setIcon(this._L.divIcon({ html: pin(active), className: '', iconSize: [26, 26], iconAnchor: [13, 13] }));
        m.setZIndexOffset(active ? 1000 : 0);
      });
      const s = this.stores.find((x) => String(x.id) === String(id));
      if (!s) return;
      this._map.flyTo([s.lat, s.lng], Math.max(this._map.getZoom(), 12), { duration: 0.8 });
      if (openPopup && this._markers[s.id]) this._markers[s.id].openPopup();
    }

    resetView() {
      if (!this._map) return;
      const list = this.stores;
      if (list.length) this._map.flyToBounds(this._L.latLngBounds(list.map((s) => [s.lat, s.lng])), { padding: [70, 70], duration: 0.8 });
      Object.values(this._markers || {}).forEach((m) => m.setIcon(this._L.divIcon({ html: pin(false), className: '', iconSize: [24, 24], iconAnchor: [12, 12] })));
    }
  }

  if (!customElements.get('store-map')) customElements.define('store-map', StoreMap);
})();
