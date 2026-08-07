#!/usr/bin/env node
// Regression tests for the store locator.
//
//   node tools/test-locator.mjs          # offline tests only
//   node tools/test-locator.mjs --live   # also exercise the live geocoder
//
// The pure logic (search ranking, distance maths, store data integrity) is
// extracted from where-to-buy.html so the tests exercise the shipped source
// rather than a copy that can drift.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'where-to-buy.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
const warnings = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; return; }
  fail++; failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}
/** Data-quality issues that need a human with the source of truth, not a code
   change. Reported every run, but they do not fail the build. */
function warn(name, cond, detail = '') {
  if (cond) { pass++; return; }
  warnings.push(`${name}${detail ? ' — ' + detail : ''}`);
}
function section(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

// --- pull the real implementations out of the page -------------------------
function extract(re, label) {
  const m = html.match(re);
  if (!m) throw new Error(`could not extract ${label} from where-to-buy.html`);
  return m[0];
}
const src = [
  extract(/function normalizeText[\s\S]*?\n}/, 'normalizeText'),
  extract(/function queryTokens[\s\S]*?\n}/, 'queryTokens'),
  extract(/const PLACE_PROMINENCE = \{[\s\S]*?\n\};/, 'PLACE_PROMINENCE'),
  extract(/const RANK_WEIGHT = \d+;/, 'RANK_WEIGHT'),
  extract(/const MAX_DISTANCE_PENALTY = \d+;/, 'MAX_DISTANCE_PENALTY'),
  extract(/function searchScore[\s\S]*?\n  return score;\n}/, 'searchScore'),
  extract(/function scoreGeocodeFeature[\s\S]*?\n  return score;\n}/, 'scoreGeocodeFeature'),
  extract(/function isPlausiblePlace[\s\S]*?\n}/, 'isPlausiblePlace')
].join('\n');

const util = readFileSync(join(ROOT, 'locator-util.js'), 'utf8');
const sandbox = { window: {} };
new Function('window', util)(sandbox.window);
const { milesBetween, formatMiles, directionsUrl, telHref } = sandbox.window.BBLocator;

const mod = new Function('milesBetween', src + `
  return { normalizeText, queryTokens, searchScore, scoreGeocodeFeature, isPlausiblePlace };
`)(milesBetween);

// --- store data ------------------------------------------------------------
// Read from stores.json, the shipped source of truth. Deep structural checks
// live in tools/validate-stores.mjs; what follows exercises the search and
// ranking logic against real records.
const storeDoc = JSON.parse(readFileSync(join(ROOT, 'stores.json'), 'utf8'));
const STORES = (Array.isArray(storeDoc) ? storeDoc : storeDoc.stores).map((s) => ({
  ...s,
  latRaw: String(s.lat),
  lngRaw: String(s.lng)
}));

const bias = {
  lat: STORES.reduce((a, s) => a + s.lat, 0) / STORES.length,
  lng: STORES.reduce((a, s) => a + s.lng, 0) / STORES.length
};

// ===========================================================================
section('Store data integrity');

check('all 102 records parse', STORES.length === 102, `got ${STORES.length}`);
check('no duplicate ids', new Set(STORES.map((s) => s.id)).size === STORES.length);

const BOX = {
  FL: [24.4, 31.1, -87.7, -79.9], GA: [30.3, 35.1, -85.7, -80.8],
  NJ: [38.9, 41.4, -75.6, -73.9], OH: [38.4, 42.0, -84.9, -80.5],
  PR: [17.8, 18.6, -67.3, -65.2], AZ: [31.3, 37.1, -114.9, -109.0],
  NY: [40.4, 45.1, -79.8, -71.8]
};
for (const s of STORES) {
  const st = s.city.split(',').pop().trim();
  const b = BOX[st];
  if (!b) { check(`known state for ${s.id}`, false, st); continue; }
  check(`${s.id} inside ${st}`,
    s.lat >= b[0] && s.lat <= b[1] && s.lng >= b[2] && s.lng <= b[3],
    `${s.lat},${s.lng}`);
}
for (const s of STORES) {
  const dp = Math.max((s.latRaw.split('.')[1] || '').length, (s.lngRaw.split('.')[1] || '').length);
  warn(`${s.id} coordinate precision >= 4dp`, dp >= 4,
    `${dp}dp ≈ ${Math.round(111000 / Math.pow(10, dp))}m of slop; needs a surveyed value`);
}
warn('every store has a phone number', STORES.every((s) => s.phone),
  'phone/url are plumbed through rows, popups and tel: links but unpopulated — needs the POS directory');

// ===========================================================================
section('Distance and formatting helpers');

check('milesBetween Miami→Atlanta ≈ 600mi',
  Math.abs(milesBetween({ lat: 25.77, lng: -80.19 }, { lat: 33.75, lng: -84.39 }) - 604) < 15);
check('milesBetween is symmetric',
  Math.abs(milesBetween({ lat: 25, lng: -80 }, { lat: 33, lng: -84 })
         - milesBetween({ lat: 33, lng: -84 }, { lat: 25, lng: -80 })) < 1e-9);
check('formatMiles(null) is empty', formatMiles(null) === '');
check('formatMiles(0.05)', formatMiles(0.05) === '< 0.1 mi');
check('formatMiles(3.14159)', formatMiles(3.14159) === '3.1 mi');
check('formatMiles(42.7) rounds', formatMiles(42.7) === '43 mi');
check('telHref strips punctuation', telHref('(305) 555-0142') === 'tel:3055550142');
check('telHref keeps +', telHref('+1 305-555-0142') === 'tel:+13055550142');
check('telHref empty', telHref('') === '');
check('directionsUrl without origin uses search',
  directionsUrl(STORES[0], null).includes('/maps/search/'));
check('directionsUrl with origin uses dir',
  directionsUrl(STORES[0], { lat: 25, lng: -80 }).includes('/maps/dir/'));

// ===========================================================================
section('Search ranking');

function search(q) {
  const tokens = mod.queryTokens(q);
  return STORES
    .map((s) => ({ s, score: mod.searchScore(s, tokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
}

check('two-word query works ("carmela boca")', search('carmela boca').length === 4);
check('"carmela boca" ranks a Boca store first',
  /Boca/.test(search('carmela boca')[0].name), search('carmela boca')[0]?.name);
check('apostrophes fold ("ruths chris")', search('ruths chris').length === 1);
check('"mcloones" finds all four', search('mcloones').length === 4);
check('accents fold ("meson")', search('meson').length === 1);
check('"cafe" matches Café type and Cafe names', search('cafe').length > 15);
check('name match outranks city match ("decatur")',
  search('decatur')[0].name === 'Savi Decatur', search('decatur')[0]?.name);
check('unmatched token excludes ("carmela nowhere")', search('carmela nowhere').length === 0);
check('empty query matches everything', search('').length === STORES.length);
check('type is searchable ("yacht club")', search('yacht club').length >= 1);

// ===========================================================================
section('Geocode ranking (offline, synthetic candidates)');

const feat = (name, state, kind, lat, lng, cc = 'US') => ({
  properties: { name, state, osm_value: kind, countrycode: cc, country: 'United States' },
  geometry: { coordinates: [lng, lat] }
});

function bestOf(list) {
  return list
    .map((f, i) => ({ f, score: mod.scoreGeocodeFeature(f, bias, i), rank: i }))
    .sort((a, b) => b.score - a.score)[0];
}

// A distant major city must beat a near hamlet of the same name — the exact
// failure that sent "denver" to a village in North Carolina.
const denver = bestOf([
  feat('Denver', 'Colorado', 'city', 39.74, -104.98),
  feat('Denver', 'North Carolina', 'village', 35.53, -81.03)
]);
check('distant city beats near hamlet', denver.f.properties.state === 'Colorado',
  denver.f.properties.state);

// Photon's ordering is respected when prominence ties.
const columbus = bestOf([
  feat('Columbus', 'Ohio', 'city', 39.96, -83.0),
  feat('Columbus', 'Georgia', 'city', 32.46, -84.99)
]);
check('Photon rank order respected for equal kinds',
  columbus.f.properties.state === 'Ohio', columbus.f.properties.state);

// Distance can still settle a genuine tie at the same rank and kind.
check('LA is plausible despite 2300mi',
  mod.isPlausiblePlace(feat('Los Angeles', 'California', 'city', 34.05, -118.24), bias, 0));
check('Seattle is plausible despite 2600mi',
  mod.isPlausiblePlace(feat('Seattle', 'Washington', 'city', 47.6, -122.33), bias, 0));
check('non-US result is rejected',
  !mod.isPlausiblePlace(
    { properties: { name: 'Portland', countrycode: 'AU', country: 'Australia', osm_value: 'town' },
      geometry: { coordinates: [141.6, -38.3] } }, bias, 0));

// No US place anywhere may be judged implausible purely for being far away.
const farFlung = [
  ['Anchorage', 61.22, -149.9], ['Honolulu', 21.31, -157.86],
  ['Boise', 43.62, -116.2], ['San Diego', 32.72, -117.16]
];
for (const [name, lat, lng] of farFlung) {
  check(`${name} is plausible`, mod.isPlausiblePlace(feat(name, '', 'city', lat, lng), bias, 0));
}

// ===========================================================================
if (process.argv.includes('--live')) {
  section('Geocode ranking (live API)');
  const cfg = readFileSync(join(ROOT, 'locator-config.js'), 'utf8');
  const endpoint = cfg.match(/endpoint: '([^']+)'/)[1];

  const expected = [
    ['los angeles', 'California'], ['seattle', 'Washington'], ['denver', 'Colorado'],
    ['portland', 'Oregon'], ['springfield', 'Massachusetts'], ['columbus', 'Ohio'],
    ['miami', 'Florida'], ['atlanta', 'Georgia'], ['chicago', 'Illinois'],
    ['phoenix', 'Arizona'], ['houston', 'Texas'], ['boise', 'Idaho']
  ];
  for (const [q, state] of expected) {
    const url = endpoint + '?' + new URLSearchParams({
      q, limit: '8', lang: 'en', lat: String(bias.lat), lon: String(bias.lng)
    });
    try {
      const r = await fetch(url);
      const d = await r.json();
      const feats = (d.features || []).filter((f) => f && f.geometry);
      const best = feats
        .map((f, i) => ({ f, score: mod.scoreGeocodeFeature(f, bias, i), rank: i }))
        .sort((a, b) => b.score - a.score)[0];
      const got = best && best.f.properties.state;
      check(`"${q}" → ${state}`, got === state, `got ${got}`);
    } catch (e) {
      check(`"${q}" → ${state}`, false, 'request failed: ' + e.message);
    }
    await new Promise((r) => setTimeout(r, 600));
  }
}

// ===========================================================================
console.log(`\n${'='.repeat(60)}`);
if (warnings.length) {
  console.log(`\n${warnings.length} data warning(s) — not build failures:\n`);
  warnings.forEach((w) => console.log('  ! ' + w));
}
if (fail) {
  console.log(`\nFAILED  ${pass} passed, ${fail} failed\n`);
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log(`\nPASSED  ${pass} assertions\n`);
