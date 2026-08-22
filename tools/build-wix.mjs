#!/usr/bin/env node
// Assemble dist/ — the directory Wix uploads.
//
//   node tools/build-wix.mjs        # build
//   node tools/build-wix.mjs --check  # build, then fail if dist/ holds anything unshippable
//
// WHY THIS EXISTS
//
// `wix release` uploads everything under wix.config.json's site.outputDirectory
// and serves it at the site root, verbatim. When that was "." the whole repo
// went up: /server.py, /README.md, /AGENTS.md and /_headers were all live and
// fetchable on brisabay.com, and the Pages function under /functions was served
// as readable text to anyone who asked for it.
//
// There is no ignore file to reach for — Wix has no _headers, no _redirects, no
// .wixignore. The only reliable control over what ships is to build the thing
// that ships. So outputDirectory points at dist/, this script fills it, and the
// default is exclusion: a file reaches production because it is named here, not
// because it happens to sit in the repo.
//
// Adding a page or an asset directory means adding it to SITE below.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

// Everything the browser is allowed to ask for, and nothing else.
const SITE = [
  // Pages. The .html extension is the URL: Wix serves no directory indexes,
  // so /findBrisaBay.html is the address, not /findBrisaBay.
  'index.html',
  'about.html',
  'ourWines.html',
  'findBrisaBay.html',
  'privacy.html',
  'terms.html',
  'accessibility.html',
  '404.html',

  // Redirect stubs for the pre-Wix URLs. These are the only redirect mechanism
  // the platform gives us; _redirects does nothing here.
  'where-to-buy.html',
  'wines.html',
  'redirect.js',

  // Runtime.
  'site.css',
  'site-data.js',
  'seo.js',
  'resources.js',
  'support.js',
  'age-gate.js',
  'wines-motion.js',
  'store-map.js',
  'locator-config.js',
  'locator-util.js',
  'locator-search.js',
  'locator-jsonld.js',
  'locator-analytics.js',

  // Data.
  'stores.json',

  // Icons.
  'favicon.ico',
  'apple-touch-icon.png',

  // Directories.
  'assets',
  'stockists'
];

// One extra entry, copied from tools/urlcheck/ to dist/urlcheck/. It exists to
// answer whether Wix serves dir/index.html at /dir — which decides whether the
// site can drop the .html suffix. Remove both once that is settled; the file
// explains itself and is noindex and unlinked in the meantime.
const PROBE = { from: 'tools/urlcheck', to: 'urlcheck' };

// sitemap.xml and robots.txt are deliberately NOT in SITE, and this is not an
// oversight. Wix owns both paths: request https://www.brisabay.com/sitemap.xml
// and Wix answers with its own generated page, not the file we uploaded. The
// repo keeps both as the canonical inventory of URLs — tools/check-pages.mjs
// validates every entry, and they are what to paste into the dashboard — but
// uploading them only creates two files nothing can ever fetch.
//
// The consequence is real and lives outside this repo: crawler directives and
// the submitted sitemap have to be maintained in the Wix dashboard, under SEO
// Tools. See README.md, "What Wix takes over".

// Named so the check below can say why, rather than just "unexpected file".
const NEVER_SHIP = [
  ['server.py', 'local dev server — Wix runs no server-side code'],
  ['tools', 'build and test scripts'],
  ['README.md', 'internal documentation'],
  ['AGENTS.md', 'internal documentation'],
  ['GETTING-INDEXED.md', 'internal documentation'],
  ['safari-check.html', 'browser diagnostics page, not part of the site'],
  ['safari-check.js', 'browser diagnostics page, not part of the site'],
  ['.env', 'secrets'],
  ['.git', 'repository internals'],
  ['.github', 'CI configuration'],
  ['.wix', 'CLI state'],
  ['wix.config.json', 'deploy configuration']
];

const check = process.argv.includes('--check');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

let files = 0;
const missing = [];

for (const entry of SITE) {
  const from = join(ROOT, entry);
  if (!existsSync(from)) { missing.push(entry); continue; }
  cpSync(from, join(DIST, entry), { recursive: true });
  files += statSync(from).isDirectory() ? countFiles(from) : 1;
}

function countFiles(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? countFiles(join(dir, e.name)) : 1;
  }
  return n;
}

cpSync(join(ROOT, PROBE.from), join(DIST, PROBE.to), { recursive: true });
files += 1;

if (missing.length) {
  console.error(`build failed — SITE lists ${missing.length} file(s) that do not exist:`);
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}

console.log(`dist/ built — ${files} files from ${SITE.length} entries`);

if (!check) process.exit(0);

// ---------------------------------------------------------------------------
// Verify the output, so a mistake here fails the build rather than the site.

const problems = [];

for (const [name, why] of NEVER_SHIP) {
  if (existsSync(join(DIST, name))) problems.push(`dist/${name} must not ship — ${why}`);
}

// Every page that ships, including the stockist pages one directory down.
const shipped = [
  ...readdirSync(DIST).filter((f) => f.endsWith('.html')),
  ...readdirSync(join(DIST, 'stockists')).filter((f) => f.endsWith('.html')).map((f) => `stockists/${f}`)
];

for (const entry of shipped) {
  const html = readFileSync(join(DIST, entry), 'utf8');
  // A page that still calls an API is a page that 404s in production: Wix has
  // no endpoints. This catches the class of regression, not one known URL.
  const apiCall = html.match(/fetch\(\s*['"`](\/api\/[^'"`]*)/);
  if (apiCall) problems.push(`dist/${entry} fetches ${apiCall[1]} — Wix serves no API routes`);
  if (!html.includes('http-equiv="Content-Security-Policy"')) {
    problems.push(`dist/${entry} has no meta CSP — it is the only CSP production gets`);
  }
  // Wix serves no directory indexes, so an extensionless internal link is a 404.
  for (const [, href] of html.matchAll(/href="(\/[a-zA-Z][\w-]*)"/g)) {
    problems.push(`dist/${entry} links ${href} — Wix has no pretty URLs, use ${href}.html`);
  }
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s) with dist/:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(`dist/ verified — nothing unshippable, ${relative(ROOT, DIST)} is ready for \`wix release\``);
