#!/usr/bin/env node
// Check the released site, from outside.
//
//   node tools/verify-live.mjs                        # checks www.brisabay.com
//   node tools/verify-live.mjs https://other.host     # or somewhere else
//
// Run this immediately after `wix release`. Everything else in tools/ checks the
// repo; this is the only thing that checks what visitors actually get, and the
// two have been out of step before — the release that renamed the pages also
// shipped apex canonicals, no CSP, and the whole repo as public files, and
// nothing caught it because nothing was looking at production.
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
  '/', '/about.html', '/ourWines.html', '/findBrisaBay.html',
  '/privacy.html', '/terms.html', '/accessibility.html'
];

// Files that were public on the domain until the dist/ build existed. If any of
// these comes back 200 again, the release uploaded the repo instead of dist/.
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

  const canonical = (body.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
  check(`${path} canonical is on ${BASE}`, canonical.startsWith(BASE),
    canonical || 'missing');
}

for (const path of MUST_NOT_EXIST) {
  const { status } = await get(path);
  check(`${path} is not public`, status === 404, String(status));
}

// The renamed URLs. No 301 is possible on Wix, so these are stub pages: the
// check is that the stub is served and points somewhere real.
for (const [stub, target] of [['/where-to-buy.html', '/findBrisaBay.html'],
                              ['/wines.html', '/ourWines.html']]) {
  const { status, body } = await get(stub);
  check(`${stub} is served`, status === 200, String(status));
  check(`${stub} redirects to ${target}`, body.includes(`0;url=${target}`));
  check(`${stub} keeps query and hash`, body.includes('redirect.js'));
}

// The apex must reach the canonical host, or every canonical points off-site.
const apex = await fetch('https://brisabay.com/', { redirect: 'manual' });
check('apex redirects to www', [301, 302, 308].includes(apex.status) &&
  (apex.headers.get('location') || '').startsWith('https://www.brisabay.com'),
  `${apex.status} → ${apex.headers.get('location')}`);

// Wix owns robots.txt, sitemap.xml and the 404 page: it answers on all three no
// matter what we upload. Recorded as observations, not failures — but if any
// ever starts serving our file, the notes in README need revisiting.
const sitemap = await get('/sitemap.xml');
const ours = sitemap.body.trimStart().startsWith('<?xml');
console.log(ours
  ? 'NOTE  /sitemap.xml is now serving our file — Wix used to override it.'
  : 'NOTE  /sitemap.xml is Wix-generated, as expected. Submit URLs via the dashboard.');

// The URL-shape probe. Temporary; see README, "URL shape".
const probe = await get('/urlcheck');
console.log(probe.status === 200
  ? 'NOTE  /urlcheck → 200. Directory indexes WORK; clean URLs are available.'
  : `NOTE  /urlcheck → ${probe.status}. Directory indexes do not resolve; .html is required.`);

console.log('\n' + '='.repeat(60));
if (failures.length) {
  console.log(`\nFAILED  ${failures.length} of ${pass + failures.length} checks\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\nPASSED  ${pass} checks against ${BASE}`);
