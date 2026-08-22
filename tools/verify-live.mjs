#!/usr/bin/env node
// Check the released site, from outside.
//
//   node tools/verify-live.mjs                        # checks www.brisabay.com
//   node tools/verify-live.mjs https://other.host     # or somewhere else
//
// Run this immediately after `wix release`. Everything else in tools/ checks the
// repo; this is the only thing that checks what visitors actually get.
//
// Exits non-zero if any assertion fails, so it can gate a deploy script.

const BASE = (process.argv[2] || 'https://www.brisabay.com').replace(/\/$/, '');

let pass = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; return; }
  failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}

async function get(path, redirect = 'manual') {
  const res = await fetch(BASE + path, { redirect });
  const body = res.headers.get('content-type')?.includes('text')
    ? await res.text() : '';
  return { status: res.status, headers: res.headers, body };
}

const PAGES = [
  '/', '/about', '/ourWines', '/findBrisaBay',
  '/privacy', '/terms', '/accessibility'
];

const MUST_NOT_EXIST = [
  '/server.py', '/README.md', '/AGENTS.md', '/GETTING-INDEXED.md',
  '/_headers', '/_redirects', '/functions/api/instagram/moments.js',
  '/safari-check.html', '/.env'
];

console.log(`Verifying ${BASE}\n`);

for (const path of PAGES) {
  const { status, body } = await get(path);
  check(`${path} responds 200`, status === 200, String(status));
  if (status !== 200) continue;

  check(`${path} carries a CSP`, body.includes('http-equiv="Content-Security-Policy"'));
  check(`${path} does not call a dead API`, !/fetch\(\s*['"`]\/api\//.test(body));
  check(`${path} does not need unsafe-eval`, !body.includes('unsafe-eval'));

  const canonical = (body.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
  check(`${path} canonical is on ${BASE}`, canonical.startsWith(BASE),
    canonical || 'missing');
  check(`${path} canonical has no .html`, !canonical.endsWith('.html'), canonical);
}

for (const path of MUST_NOT_EXIST) {
  const { status } = await get(path);
  check(`${path} is not public`, status === 404, String(status));
}

for (const [from, to] of [
  ['/about.html', '/about'],
  ['/ourWines.html', '/ourWines'],
  ['/findBrisaBay.html', '/findBrisaBay'],
  ['/where-to-buy.html', '/findBrisaBay'],
  ['/wines.html', '/ourWines'],
  ['/privacy.html', '/privacy'],
  ['/terms.html', '/terms'],
  ['/accessibility.html', '/accessibility'],
  ['/wines', '/ourWines'],
  ['/where-to-buy', '/findBrisaBay']
]) {
  const { status, headers } = await get(from);
  const location = headers.get('location') || '';
  check(`${from} redirects`, [301, 302, 308].includes(status), String(status));
  check(`${from} → ${to}`, location.endsWith(to) || location.includes(to), location);
}

const apex = await fetch('https://brisabay.com/', { redirect: 'manual' });
check('apex redirects to www', [301, 302, 308].includes(apex.status) &&
  (apex.headers.get('location') || '').startsWith('https://www.brisabay.com'),
  `${apex.status} → ${apex.headers.get('location')}`);

const sitemap = await get('/sitemap.xml');
const ours = sitemap.body.trimStart().startsWith('<?xml');
console.log(ours
  ? 'NOTE  /sitemap.xml is now serving our file — Wix used to override it.'
  : 'NOTE  /sitemap.xml is Wix-generated, as expected. Submit pretty URLs via the dashboard.');

console.log('\n' + '='.repeat(60));
if (failures.length) {
  console.log(`\nFAILED  ${failures.length} of ${pass + failures.length} checks\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\nPASSED  ${pass} checks against ${BASE}`);
