#!/usr/bin/env node
// Static checks over the seven pages.
//
//   node tools/check-pages.mjs
//
// Each page carries a <script type="text/x-dc"> logic block that the runtime
// compiles with new Function at mount time. Nothing parses it before then: it is
// not JavaScript as far as the browser is concerned, so a syntax error there is
// invisible until the page is opened, and it does not fail loudly — the
// component simply never mounts and the page renders as raw, unstyled template.
//
// That is exactly how a missing comma in renderVals took out three pages during
// the phase 4 copyright change. The browser reported no error; the only symptom
// was a mailto: link with no address.
//
// These checks are static and cheap, and cover the mistakes that are silent at
// runtime.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSP = JSON.parse(readFileSync(join(ROOT, 'tools', 'csp.json'), 'utf8'));
const PUBLIC_PAGES = [
  'index.html', 'about.html', 'ourWines.html', 'findBrisaBay.html',
  'privacy.html', 'terms.html', 'accessibility.html'
];

function canonPath(file) {
  if (file === 'index.html') return 'https://www.brisabay.com/';
  return 'https://www.brisabay.com/' + file;
}

for (const expected of PUBLIC_PAGES) {
  if (!existsSync(join(ROOT, expected))) {
    console.error(`missing public page: ${expected}`);
    process.exit(1);
  }
}

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; return; }
  fail++; failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}
function section(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

const pages = PUBLIC_PAGES.map((f) => ({ file: f, html: readFileSync(join(ROOT, f), 'utf8') }));

// ===========================================================================
section('Logic blocks parse');

for (const { file, html } of pages) {
  const m = html.match(/data-dc-script[^>]*>\n([\s\S]*?)<\/script>/);
  if (!m) { check(`${file} has a logic block`, false); continue; }
  // `class Component extends DCLogic` needs the base class to exist before the
  // body will parse standalone.
  const src = 'class DCLogic {}\n' + m[1];
  let err = null;
  try { new Function(src); } catch (e) { err = e.message; }
  check(`${file} logic block parses`, err === null, err || '');
}

// ===========================================================================
section('Template interpolation resolves');

for (const { file, html } of pages) {
  const body = html.slice(html.indexOf('<x-dc>'), html.indexOf('</x-dc>'));
  const logic = (html.match(/data-dc-script[^>]*>\n([\s\S]*?)<\/script>/) || [, ''])[1];
  const props = (html.match(/data-props="([^"]*)"/) || [, ''])[1];

  // Literals, not names to resolve.
  const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'this']);

  const used = [...new Set([...body.matchAll(/\{\{\s*([A-Za-z_$][\w$]*)/g)].map((x) => x[1]))]
    .filter((n) => !LITERALS.has(n));

  const missing = used.filter((name) => {
    // renderVals supplies these as `name: value` or as ES6 shorthand `name,`
    if (new RegExp(`(^|[\\s{,])${name}\\s*:`, 'm').test(logic)) return false;
    if (new RegExp(`(^|[\\s{,])${name}\\s*[,}]`, 'm').test(logic)) return false;
    // …or it is a local binding the shorthand then returns
    if (new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(logic)) return false;
    if (props.includes(`&quot;${name}&quot;`)) return false;
    if (new RegExp(`as="${name}"`).test(body)) return false;   // <sc-for> loop variable
    return true;
  });
  check(`${file}: every {{ value }} has a source`, missing.length === 0, missing.join(', '));
}

// ===========================================================================
section('Shared resources are wired up');

for (const { file, html } of pages) {
  const head = html.slice(0, html.indexOf('</head>'));
  check(`${file} links site.css`, /href="\.\/site\.css\?v=\d+"/.test(head));
  check(`${file} loads site-data.js`, /src="\.\/site-data\.js\?v=\d+"/.test(head));
  // The meta CSP is not belt-and-braces here — it is the whole belt. Wix sends
  // no security headers and gives no way to add them, so a page without this
  // tag ships with no policy at all. tools/csp.json holds the expected text.
  const expectedCsp = CSP.policies[CSP.pages[file] || CSP.default];
  const actualCsp = (head.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1];
  check(`${file} carries a meta CSP`, Boolean(actualCsp));
  check(`${file} CSP matches tools/csp.json`, actualCsp === expectedCsp, actualCsp || 'missing');
  check(`${file} preloads both WOFF2 faces`,
    /rel="preload"[^>]+EBGaramond-Regular\.woff2/.test(head) &&
    /rel="preload"[^>]+OldNewspaperTypes\.woff2/.test(head));

  // resources.js must precede support.js or the vendored-React override is read
  // too late; site.css must precede both so it is not render-blocking mid-parse.
  const iCss = head.indexOf('site.css');
  const iRes = head.indexOf('resources.js');
  const iSup = head.indexOf('support.js');
  check(`${file} head order: site.css, resources.js, support.js`,
    iCss > -1 && iCss < iRes && iRes < iSup, `${iCss} / ${iRes} / ${iSup}`);
}

// ===========================================================================
section('Wix hosting constraints');

// Wix serves uploaded files verbatim at their own path. It has no directory
// indexes, no redirect rules and no server-side code, so three things that were
// fine on Cloudflare Pages are silent 404s here.
for (const { file, html } of pages) {
  const prettyLinks = [...html.matchAll(/href="(\/[a-zA-Z][\w-]*)"/g)].map((m) => m[1]);
  check(`${file} links no extensionless URLs`, prettyLinks.length === 0,
    [...new Set(prettyLinks)].join(', '));
  check(`${file} calls no /api route`, !/fetch\(\s*['"`]\/api\//.test(html));
}

// ===========================================================================
section('No duplication regressions');

// These moved into site.css and site-data.js. A page redefining them locally
// means the extraction has started to unravel.
for (const { file, html } of pages) {
  check(`${file} does not redefine the shared preamble`,
    !html.includes('[data-bb-wordmark] {') && !html.includes('[data-bb-skiplink] {'));
  check(`${file} does not hardcode the contact address`,
    !/info@brisabay\.com/.test(html.slice(html.indexOf('<x-dc>'), html.indexOf('</x-dc>'))));
  check(`${file} does not hardcode a copyright year`, !/Brisa Bay 20\d\d/.test(html));
}

// ===========================================================================
section('Accessibility basics');

for (const { file, html } of pages) {
  // Strip <style> first: a CSS comment mentioning <h1> is not an element, and
  // counting it produced a false "two headings" failure.
  const body = html.slice(html.indexOf('<x-dc>'), html.indexOf('</x-dc>'))
    .replace(/<style>[\s\S]*?<\/style>/g, '');
  const h1s = (body.match(/<h1[\s>]/g) || []).length;
  check(`${file} has exactly one <h1>`, h1s === 1, `${h1s}`);
  check(`${file} has a skip link`, /data-bb-skiplink=""/.test(body));
  check(`${file} declares a language`, /<html lang="[a-z]{2}"/.test(html));
  const imgs = body.match(/<img\b[^>]*>/g) || [];
  check(`${file}: every <img> has alt`, imgs.every((t) => /\balt=/.test(t)),
    imgs.filter((t) => !/\balt=/.test(t)).length + ' without');
  check(`${file}: every <img> declares dimensions`,
    imgs.every((t) => /\bwidth=/.test(t) && /\bheight=/.test(t)) ||
    imgs.filter((t) => !/\bwidth=/.test(t)).every((t) => /\{\{/.test(t)),
    imgs.filter((t) => !/\bwidth=/.test(t) && !/\{\{/.test(t)).length + ' without');
}

// ===========================================================================
section('SEO head tags');

for (const { file, html } of pages) {
  const head = html.slice(0, html.indexOf('</head>'));
  const helmet = (html.match(/<helmet>[\s\S]*?<\/helmet>/) || [''])[0];
  check(`${file} has a static <title> in <head>`, /<title>.+<\/title>/.test(head));
  check(`${file} has a static meta description in <head>`,
    /<meta name="description" content="[^"]+"/.test(head));
  check(`${file} has a canonical URL`, /<link rel="canonical" href="https:\/\/www\.brisabay\.com\//.test(head));
  check(`${file} has og:url`, /property="og:url" content="https:\/\/www\.brisabay\.com\//.test(head));
  const og = (head.match(/property="og:image" content="(https:\/\/www\.brisabay\.com\/assets\/web2\/og-[^"]+\.jpg)"/) || [])[1];
  check(`${file} has an absolute og:image under assets/web2`, Boolean(og), og || 'missing');
  const canonical = (head.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
  const ogUrl = (head.match(/property="og:url" content="([^"]+)"/) || [])[1] || '';
  const expectedCanon = canonPath(file);
  check(`${file} canonical is self-referential`, canonical === expectedCanon, canonical);
  check(`${file} og:url matches canonical`, ogUrl === canonical, ogUrl);
  check(`${file} helmet does not duplicate <title>`, !/<title>/.test(helmet));
  check(`${file} helmet does not duplicate og: tags`, !/property="og:/.test(helmet));
  const iData = head.indexOf('site-data.js');
  const iSeo = head.indexOf('seo.js');
  check(`${file} loads seo.js after site-data.js`,
    iSeo > -1 && iData > -1 && iData < iSeo, `${iData} / ${iSeo}`);
}

{
  const titles = [];
  const descs = [];
  for (const { file, html } of pages) {
    const head = html.slice(0, html.indexOf('</head>'));
    const title = (head.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
    const desc = (head.match(/<meta name="description" content="([^"]+)"/) || [])[1] || '';
    const plainTitle = title.replace(/&amp;/g, '&');
    check(`${file} title length 15–70`, plainTitle.length >= 15 && plainTitle.length <= 70,
      `${plainTitle.length}`);
    check(`${file} description length 50–160`, desc.length >= 50 && desc.length <= 160,
      `${desc.length}`);
    titles.push([file, plainTitle]);
    descs.push([file, desc]);
  }
  for (let i = 0; i < titles.length; i++) {
    for (let j = i + 1; j < titles.length; j++) {
      check(`titles unique: ${titles[i][0]} vs ${titles[j][0]}`, titles[i][1] !== titles[j][1]);
      check(`descriptions unique: ${descs[i][0]} vs ${descs[j][0]}`, descs[i][1] !== descs[j][1]);
    }
  }
}

{
  const robots = existsSync(join(ROOT, 'robots.txt'))
    ? readFileSync(join(ROOT, 'robots.txt'), 'utf8') : '';
  const sitemap = existsSync(join(ROOT, 'sitemap.xml'))
    ? readFileSync(join(ROOT, 'sitemap.xml'), 'utf8') : '';
  check('robots.txt exists', robots.length > 0);
  check('robots.txt points at the sitemap', robots.includes('Sitemap: https://www.brisabay.com/sitemap.xml'));
  check('robots.txt does not Disallow safari-check', !/Disallow:\s*\/safari-check/.test(robots));
  check('sitemap.xml exists', sitemap.length > 0);
  check('sitemap uses lastmod', sitemap.includes('<lastmod>'));
  check('sitemap omits changefreq', !sitemap.includes('<changefreq>'));
  check('sitemap omits priority', !sitemap.includes('<priority>'));
  for (const f of PUBLIC_PAGES) {
    const loc = canonPath(f);
    check(`sitemap lists public ${f}`, sitemap.includes(`<loc>${loc}</loc>`));
  }
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  check('sitemap has loc entries', locs.length > 0);
  for (const loc of locs) {
    const path = loc.replace('https://www.brisabay.com/', '').replace(/\/$/, '');
    const file = path === '' ? 'index.html' : path;
    check(`sitemap loc resolves: ${loc}`, existsSync(join(ROOT, file)), file);
  }
  check('sitemap does not list safari-check.html', !sitemap.includes('safari-check.html'));
  check('sitemap does not list 404.html', !sitemap.includes('404.html'));
}

{
  const safari = join(ROOT, 'safari-check.html');
  if (existsSync(safari)) {
    const html = readFileSync(safari, 'utf8');
    check('safari-check.html is noindex', /name="robots" content="noindex/.test(html));
  }
  const notFound = join(ROOT, '404.html');
  if (existsSync(notFound)) {
    const html = readFileSync(notFound, 'utf8');
    check('404.html is noindex', /name="robots" content="noindex/.test(html));
  }
}

{
  const stockDir = join(ROOT, 'stockists');
  const stockFiles = existsSync(stockDir)
    ? readdirSync(stockDir).filter((f) => f.endsWith('.html')).sort()
    : [];
  check('stockist pages exist', stockFiles.length >= 16, `${stockFiles.length}`);
  const sitemap = existsSync(join(ROOT, 'sitemap.xml'))
    ? readFileSync(join(ROOT, 'sitemap.xml'), 'utf8') : '';
  for (const f of stockFiles) {
    const html = readFileSync(join(stockDir, f), 'utf8');
    const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
    check(`stockists/${f} canonical is self-referential`,
      canonical === `https://www.brisabay.com/stockists/${f}`, canonical);
    check(`stockists/${f} is in the sitemap`,
      sitemap.includes(`<loc>https://www.brisabay.com/stockists/${f}</loc>`));
    check(`stockists/${f} has one h1`, (html.match(/<h1[\s>]/g) || []).length === 1);
    check(`stockists/${f} is not noindex`, !/name="robots" content="noindex/.test(html));
  }
  const wtb = readFileSync(join(ROOT, 'findBrisaBay.html'), 'utf8');
  for (const f of stockFiles) {
    check(`where-to-buy links stockists/${f}`, wtb.includes(`stockists/${f}`));
  }
}

{
  // The Cloudflare Pages files are gone: Wix reads neither, and leaving them in
  // the tree invites someone to edit a policy that has no effect. What replaces
  // them is tools/csp.json (enforced per page above) and the redirect stubs.
  check('_headers is gone (Wix ignores it)', !existsSync(join(ROOT, '_headers')));
  check('_redirects is gone (Wix ignores it)', !existsSync(join(ROOT, '_redirects')));
  check('no Pages functions remain', !existsSync(join(ROOT, 'functions')));

  const cfg = JSON.parse(readFileSync(join(ROOT, 'wix.config.json'), 'utf8'));
  check('wix.config.json builds from dist/', cfg.site && cfg.site.outputDirectory === 'dist',
    cfg.site ? cfg.site.outputDirectory : 'no site block');

  // Every pre-Wix URL that was ever indexed needs a stub, because a 301 is not
  // available. Each must point at a page that exists.
  for (const [stub, target] of [['where-to-buy.html', 'findBrisaBay.html'], ['wines.html', 'ourWines.html']]) {
    const html = existsSync(join(ROOT, stub)) ? readFileSync(join(ROOT, stub), 'utf8') : '';
    check(`${stub} redirects to ${target}`, html.includes(`0;url=/${target}`), stub);
    check(`${stub} redirect target exists`, existsSync(join(ROOT, target)));
    check(`${stub} preserves query and hash`, html.includes(`src="./redirect.js" data-to="/${target}"`));
    check(`${stub} is not in the sitemap`,
      !readFileSync(join(ROOT, 'sitemap.xml'), 'utf8').includes(`/${stub}<`));
  }
}

{
  const css = readFileSync(join(ROOT, 'site.css'), 'utf8');
  const faces = css.match(/@font-face\s*\{[^}]+\}/g) || [];
  check('every @font-face sets font-display: swap',
    faces.length >= 2 && faces.every((b) => /font-display:\s*swap/.test(b)),
    `${faces.length} faces`);
  check('fonts are woff2', faces.every((b) => /format\('woff2'\)/.test(b)));
}

// ===========================================================================
console.log('\n' + '='.repeat(60));
if (failures.length) {
  console.log(`\n${failures.length} failure(s):\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log(`\nFAILED  ${fail} of ${pass + fail} checks`);
  process.exit(1);
}
console.log(`\nPASSED  ${pass} checks across ${pages.length} pages`);
