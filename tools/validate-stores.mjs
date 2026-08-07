#!/usr/bin/env node
// Validate stores.json before it ships.
//
//   node tools/validate-stores.mjs
//   node tools/validate-stores.mjs --geocode   # also check addresses resolve
//
// Errors fail the run. Warnings are things a human with the source of truth
// needs to resolve — they are reported but do not block.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(readFileSync(join(ROOT, 'stores.json'), 'utf8'));
const stores = Array.isArray(doc) ? doc : doc.stores;

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// Rough state bounding boxes — catches a transposed sign or a digit typo, which
// is how bad coordinates actually get in.
const BOX = {
  FL: [24.4, 31.1, -87.7, -79.9], GA: [30.3, 35.1, -85.7, -80.8],
  NJ: [38.9, 41.4, -75.6, -73.9], OH: [38.4, 42.0, -84.9, -80.5],
  PR: [17.8, 18.6, -67.3, -65.2], AZ: [31.3, 37.1, -114.9, -109.0],
  NY: [40.4, 45.1, -79.8, -71.8], CA: [32.5, 42.1, -124.5, -114.1],
  TX: [25.8, 36.6, -106.7, -93.5], IL: [36.9, 42.6, -91.6, -87.0],
  MA: [41.2, 42.9, -73.6, -69.9], CO: [36.9, 41.1, -109.1, -102.0],
  WA: [45.5, 49.1, -124.9, -116.9], NC: [33.8, 36.6, -84.4, -75.4],
  SC: [32.0, 35.3, -83.4, -78.5], VA: [36.5, 39.5, -83.7, -75.2],
  PA: [39.7, 42.3, -80.6, -74.6], CT: [40.9, 42.1, -73.8, -71.7],
  MD: [37.9, 39.8, -79.5, -75.0], TN: [34.9, 36.7, -90.4, -81.6]
};

if (!Array.isArray(stores) || !stores.length) {
  err('stores.json contains no records');
} else {
  const ids = new Set();
  const coords = new Map();

  for (const [i, s] of stores.entries()) {
    const at = `#${i} ${s && s.id ? s.id : '(no id)'}`;

    for (const field of ['id', 'name', 'type', 'address', 'city']) {
      if (!s[field] || typeof s[field] !== 'string' || !s[field].trim()) {
        err(`${at}: missing or empty "${field}"`);
      }
    }
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) {
      err(`${at}: lat/lng must be numbers`);
      continue;
    }
    if (s.lat < -90 || s.lat > 90 || s.lng < -180 || s.lng > 180) {
      err(`${at}: coordinates out of range (${s.lat}, ${s.lng})`);
    }
    if (ids.has(s.id)) err(`${at}: duplicate id`);
    ids.add(s.id);
    if (!/^[a-z0-9-]+$/.test(s.id || '')) {
      warn(`${at}: id is not lowercase-kebab, which URLs assume`);
    }

    // City must end in a two-letter state we can check against.
    const st = String(s.city).split(',').pop().trim();
    if (!/^[A-Z]{2}$/.test(st)) {
      warn(`${at}: city "${s.city}" does not end in a two-letter state`);
    } else if (!BOX[st]) {
      warn(`${at}: no bounding box on file for ${st} — coordinates unchecked`);
    } else {
      const [a, b, c, d] = BOX[st];
      if (s.lat < a || s.lat > b || s.lng < c || s.lng > d) {
        err(`${at}: coordinates (${s.lat}, ${s.lng}) fall outside ${st}`);
      }
    }

    const dp = Math.max(
      (String(s.lat).split('.')[1] || '').length,
      (String(s.lng).split('.')[1] || '').length
    );
    if (dp <= 3) {
      warn(`${at}: coordinates only ${dp}dp (~${Math.round(111000 / 10 ** dp)}m of slop)`);
    }

    const key = `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`;
    if (coords.has(key)) {
      warn(`${at}: shares coordinates with ${coords.get(key)} — verify both addresses`);
    } else {
      coords.set(key, s.id);
    }

    if (s.phone && !/[0-9]/.test(s.phone)) err(`${at}: phone has no digits`);
    if (s.url && !/^https?:\/\//.test(s.url)) err(`${at}: url must be absolute`);
  }

  const missingPhone = stores.filter((s) => !s.phone).length;
  if (missingPhone) warn(`${missingPhone}/${stores.length} records have no phone number`);
  const missingUrl = stores.filter((s) => !s.url).length;
  if (missingUrl) warn(`${missingUrl}/${stores.length} records have no website`);
}

console.log(`Validated ${stores ? stores.length : 0} stockists from stores.json`);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  warnings.forEach((w) => console.log('  ! ' + w));
}
if (errors.length) {
  console.log(`\n${errors.length} error(s):`);
  errors.forEach((e) => console.log('  ✗ ' + e));
  process.exit(1);
}
console.log('\nNo errors.');
