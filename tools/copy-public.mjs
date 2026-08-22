#!/usr/bin/env node
// Copy the files Astro should serve from / into public/.
// Assets, icons, stores.json, and the classic client scripts that tests still
// load from the repo root. New page scripts live in public/js/ already.

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

mkdirSync(PUBLIC, { recursive: true });
mkdirSync(join(PUBLIC, 'js'), { recursive: true });

const dirs = ['assets'];
for (const dir of dirs) {
  const from = join(ROOT, dir);
  if (!existsSync(from)) continue;
  rmSync(join(PUBLIC, dir), { recursive: true, force: true });
  cpSync(from, join(PUBLIC, dir), { recursive: true });
}

rmSync(join(PUBLIC, 'assets/fonts/OldNewspaperTypes.ttf'), { force: true });
rmSync(join(PUBLIC, 'assets/vendor/react'), { recursive: true, force: true });

const files = [
  'favicon.ico',
  'favicon.png',
  'apple-touch-icon.png',
  'stores.json'
];
for (const file of files) {
  const from = join(ROOT, file);
  if (existsSync(from)) cpSync(from, join(PUBLIC, file));
}

const scripts = [
  'age-gate.js',
  'wines-motion.js',
  'store-map.js',
  'locator-config.js',
  'locator-util.js',
  'locator-search.js',
  'locator-analytics.js',
  'locator-jsonld.js'
];
for (const file of scripts) {
  const from = join(ROOT, file);
  if (existsSync(from)) cpSync(from, join(PUBLIC, 'js', file));
}

console.log('public/ synced');
