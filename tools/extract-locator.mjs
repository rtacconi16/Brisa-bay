#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'findBrisaBay.html'), 'utf8');
const start = html.indexOf('// Stockists live');
const classStart = html.indexOf('class Component extends DCLogic {');
const scriptEnd = html.indexOf('\n</script>', classStart);
let helpers = html.slice(start, classStart);
let klass = html.slice(classStart, scriptEnd);

klass = klass
  .replace('class Component extends DCLogic {', 'class LocatorApp {')
  .replace(
    `state = {
    ageOk: !!(typeof BBAgeGate !== 'undefined' && BBAgeGate.readOk()),
    faqOpen: false, gateDenied: false,
    query: '', typeFilter: null, active: null,`,
    `state = {
    query: '', typeFilter: null, active: null,`
  )
  .replace(
    `    this._onKeyDown = (e) => {
      if (e.key !== 'Escape' || !this.state.faqOpen) return;
      e.preventDefault();
      this.setState({ faqOpen: false });
    };
    document.addEventListener('keydown', this._onKeyDown);
    // URL state names stores and types, so it can only be validated once the
    // data is in. Everything else can start without it.
    loadStores().then((list) => {`,
    `    loadStores().then((list) => {`
  )
  .replace(
    `    this._resumeLocationIfGranted();
    // The gate is up on first paint, before any state change would trigger an
    // update, so seal the page now rather than waiting for one.
    setTimeout(() => this._syncModal(), 0);
  }`,
    `    this._resumeLocationIfGranted();
    this.render();
  }`
  )
  .replace(
    `    this._writeUrlState();
    this._syncModal();
  }

  _syncModal() {
    if (!window.BBAgeGate) return;
    BBAgeGate.syncModal(this, {
      gateOpen: (this.props.ageGate ?? true) && !this.state.ageOk,
      gateDenied: !!this.state.gateDenied,
      faqOpen: !!this.state.faqOpen
    });
  }
  componentWillUnmount() {
    document.removeEventListener('store-select', this._onPick);
    document.removeEventListener('store-deselect', this._onDeselect);
    document.removeEventListener('store-locate', this._onLocate);
    document.removeEventListener('store-hover', this._onMapHover);
    document.removeEventListener('store-map-moved', this._onMapMoved);
    document.removeEventListener('keydown', this._onKeyDown);
    clearTimeout(this._geoTimer);
    clearTimeout(this._urlTimer);
    if (window.BBAgeGate) BBAgeGate.cleanupModal(this);
  }`,
    `    this._writeUrlState();
  }

  componentWillUnmount() {
    document.removeEventListener('store-select', this._onPick);
    document.removeEventListener('store-deselect', this._onDeselect);
    document.removeEventListener('store-locate', this._onLocate);
    document.removeEventListener('store-hover', this._onMapHover);
    document.removeEventListener('store-map-moved', this._onMapMoved);
    clearTimeout(this._geoTimer);
    clearTimeout(this._urlTimer);
  }`
  )
  .replace(
    `  _activate(fn) {
    return BBAgeGate.activate(fn);
  }`,
    `  _activate(fn) {
    return window.BBAgeGate ? window.BBAgeGate.activate(fn) : fn;
  }`
  )
  .replace('  renderVals() {', '  compute() {')
  .replace(
    `    const doAcceptAge = () => { BBAgeGate.writeOk(); this.setState({ ageOk: true }); };
    const doDenyAge = () => this.setState({ gateDenied: true });
    const doRetryAge = () => this.setState({ gateDenied: false });
    const doCloseFaq = () => this.setState({ faqOpen: false });
    const doClearFilters`,
    `    const doClearFilters`
  )
  .replace(
    `      contactEmail: BBSite.contactEmail,

      copyright: BBSite.copyright(),
      showList: this.props.storeList ?? true,
      showSearch: this.props.search ?? true,`,
    `      contactEmail: this.contactEmail,
      showList: true,
      showSearch: true,`
  )
  .replace(
    `      askMailto: 'mailto:' + BBSite.contactEmail`,
    `      askMailto: 'mailto:' + this.contactEmail`
  )
  .replace(
    `      resetView: doReset,
      resetViewKey: this._activate(doReset),
      showGate: (this.props.ageGate ?? true) && !this.state.ageOk,
      gateAsking: !this.state.gateDenied,
      gateDenied: !!this.state.gateDenied,
      acceptAge: doAcceptAge,
      acceptAgeKey: this._activate(doAcceptAge),
      denyAge: doDenyAge,
      denyAgeKey: this._activate(doDenyAge),
      retryAge: doRetryAge,
      retryAgeKey: this._activate(doRetryAge),
      faqOpen: !!this.state.faqOpen,
      openFaq: (e) => { if (e && e.preventDefault) e.preventDefault(); this.setState({ faqOpen: true }); },
      closeFaq: doCloseFaq,
      closeFaqKey: this._activate(doCloseFaq),
      // The locator is on screen here, so this answer describes the controls in
      // front of the reader instead of pointing at the page they are already on.
      faqItems: BBSite.faq({ 'where-to-buy': 'Search a store, city, ZIP or address, or tap the crosshair to use your location. You can also filter by type and by distance. If your favourite spot does not carry us yet, ask them to order it.' })
    };
  }
}`,
    `      resetView: doReset,
      resetViewKey: this._activate(doReset)
    };
  }
}`
  );

helpers = helpers.replace(
  `async function loadStores() {
  const cfg = (window.BB_LOCATOR_CONFIG && window.BB_LOCATOR_CONFIG.stores) || {};
  const url = cfg.url || '/stores.json';
  try {
    const { createClient, OAuthStrategy } = await import('https://esm.sh/@wix/sdk@1');
    const { items } = await import('https://esm.sh/@wix/data@1');
    const wix = createClient({
      modules: { items },
      auth: OAuthStrategy({ clientId: 'e67c40ee-b5bc-459a-9e2b-267b8cf96c85' })
    });`,
  `import { createClient, OAuthStrategy } from '@wix/sdk';
import { items } from '@wix/data';

const WIX_CLIENT_ID = 'e67c40ee-b5bc-459a-9e2b-267b8cf96c85';

async function loadStores() {
  const cfg = (window.BB_LOCATOR_CONFIG && window.BB_LOCATOR_CONFIG.stores) || {};
  const url = cfg.url || '/stores.json';
  try {
    const wix = createClient({
      modules: { items },
      auth: OAuthStrategy({ clientId: WIX_CLIENT_ID })
    });`
);

const paint = `
LocatorApp.prototype.setState = function (patch, cb) {
  Object.assign(this.state, patch);
  this.render();
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
  const self = this;
  const activate = (fn) => this._activate(fn);
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
    const fn = activate(() => e.target.click());
    fn(e);
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
`;

const out = helpers + klass + '\n' + paint + '\n';
mkdirSync(join(ROOT, 'src', 'scripts'), { recursive: true });
writeFileSync(join(ROOT, 'src', 'scripts', 'locator-app.js'), out);
console.log('src/scripts/locator-app.js written', out.length);
