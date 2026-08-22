#!/usr/bin/env node
// Static checks over the Astro source. The live site is SSR, so these look at
// src/ rather than a built dist/: a missing title or a leftover .html href is
// a source mistake, and catching it before `wix build` is the point.
//
//   node tools/check-pages.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSP = JSON.parse(readFileSync(join(ROOT, 'tools', 'csp.json'), 'utf8'));
const ORIGIN = 'https://www.brisabay.com';

const PUBLIC_PAGES = [
  { file: 'src/pages/index.astro', path: '/' },
  { file: 'src/pages/about.astro', path: '/about' },
  { file: 'src/pages/ourWines.astro', path: '/ourWines' },
  { file: 'src/pages/findBrisaBay.astro', path: '/findBrisaBay' },
  { file: 'src/pages/privacy.astro', path: '/privacy' },
  { file: 'src/pages/terms.astro', path: '/terms' },
  { file: 'src/pages/accessibility.astro', path: '/accessibility' }
];

function canonPath(path) {
  return path === '/' ? `${ORIGIN}/` : `${ORIGIN}${path}`;
}

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; return; }
  fail++; failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}
function section(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

const pages = PUBLIC_PAGES.map((p) => ({
  ...p,
  src: readFileSync(join(ROOT, p.file), 'utf8')
}));

for (const p of PUBLIC_PAGES) {
  check(`missing page: ${p.file}`, existsSync(join(ROOT, p.file)));
}

const layout = readFileSync(join(ROOT, 'src/layouts/Layout.astro'), 'utf8');
const siteTs = readFileSync(join(ROOT, 'src/data/site.ts'), 'utf8');
const srcFiles = walk(join(ROOT, 'src'));

// ===========================================================================
section('Astro pages replace Design Components');

const srcCode = srcFiles.filter((f) => /\.(astro|html|js|ts|mjs|css)$/.test(f));
check('Layout has no DC runtime', !layout.includes('support.js') && !layout.includes('x-dc'));
check('no page loads support.js', srcCode.every((f) => {
  const text = readFileSync(f, 'utf8');
  return !/\bsrc=["'][^"']*support\.js/.test(text) && !/\bfrom ['"][^'"]*support\.js/.test(text);
}));
check('no page uses <x-dc>', srcFiles.every((f) => !readFileSync(f, 'utf8').includes('<x-dc')));
check('CSP has no unsafe-eval', !siteTs.includes('unsafe-eval') && !CSP.policies.base.includes('unsafe-eval') && !CSP.policies.locator.includes('unsafe-eval'));
check('CSP has no esm.sh', !CSP.policies.locator.includes('esm.sh') && !siteTs.includes('esm.sh'));

// ===========================================================================
section('Shared layout');

check('Layout declares html lang', /<html lang="en">/.test(layout));
check('Layout has a skip link', /data-bb-skiplink=""/.test(layout));
check('Layout emits a meta CSP', /http-equiv="Content-Security-Policy"/.test(layout));
check('Layout preloads both WOFF2 faces',
  /EBGaramond-Regular\.woff2/.test(layout) && /OldNewspaperTypes\.woff2/.test(layout));
check('Layout canonicalises from ORIGIN + path', layout.includes('const canonical'));

const siteBase = (siteTs.match(/base:\s*"([^"]+)"/) || [])[1];
const siteLocator = (siteTs.match(/locator:\s*"([^"]+)"/) || [])[1];
check('site.ts base CSP matches tools/csp.json', siteBase === CSP.policies.base, siteBase || 'missing');
check('site.ts locator CSP matches tools/csp.json', siteLocator === CSP.policies.locator, siteLocator || 'missing');
check('Layout picks locator CSP only when asked', layout.includes('locator ? CSP.locator : CSP.base'));

// ===========================================================================
section('Pretty URLs');

const htmlHrefs = [];
for (const file of srcFiles) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/href="([^"]+\.html[^"]*)"/g)) {
    htmlHrefs.push(`${file.replace(ROOT + '/', '')}: ${m[1]}`);
  }
}
check('src/ links no .html URLs', htmlHrefs.length === 0, htmlHrefs.slice(0, 8).join(', '));
check('src/ calls no /api route', srcFiles.every((f) => !/fetch\(\s*['"`]\/api\//.test(readFileSync(f, 'utf8'))));

const mw = readFileSync(join(ROOT, 'src/middleware.ts'), 'utf8');
check('middleware strips .html', mw.includes('.html'));
check('middleware aliases /wines', mw.includes("'/wines': '/ourWines'"));
check('middleware aliases /where-to-buy', mw.includes("'/where-to-buy': '/findBrisaBay'"));

// ===========================================================================
section('SEO head tags');

const titles = [];
const descs = [];
for (const { file, src, path } of pages) {
  const title = (src.match(/\btitle="([^"]+)"/) || [])[1] || '';
  const desc = (src.match(/\bdescription="([^"]+)"/) || [])[1] || '';
  const declaredPath = (src.match(/\bpath="([^"]+)"/) || [])[1] || '';
  check(`${file} has a title`, title.length > 0);
  check(`${file} has a description`, desc.length > 0);
  check(`${file} path is ${path}`, declaredPath === path, declaredPath);
  check(`${file} title length 15–70`, title.length >= 15 && title.length <= 70, `${title.length}`);
  check(`${file} description length 50–160`, desc.length >= 50 && desc.length <= 160, `${desc.length}`);
  titles.push([file, title]);
  descs.push([file, desc]);
}
for (let i = 0; i < titles.length; i++) {
  for (let j = i + 1; j < titles.length; j++) {
    check(`titles unique: ${titles[i][0]} vs ${titles[j][0]}`, titles[i][1] !== titles[j][1]);
    check(`descriptions unique: ${descs[i][0]} vs ${descs[j][0]}`, descs[i][1] !== descs[j][1]);
  }
}

{
  const notFound = readFileSync(join(ROOT, 'src/pages/404.astro'), 'utf8');
  check('404.astro is noindex', /noindex/.test(notFound));
  check('404.astro has one h1', (notFound.match(/<h1[\s>]/g) || []).length === 1);
}

// ===========================================================================
section('Accessibility basics');

const partials = ['home', 'about', 'ourWines', 'privacy', 'terms', 'accessibility']
  .map((name) => ({ name, html: readFileSync(join(ROOT, `src/partials/${name}.html`), 'utf8') }));

for (const { name, html } of partials) {
  const body = html.replace(/<style>[\s\S]*?<\/style>/g, '');
  const h1s = (body.match(/<h1[\s>]/g) || []).length;
  check(`${name}.html has exactly one <h1>`, h1s === 1, `${h1s}`);
  const imgs = body.match(/<img\b[^>]*>/g) || [];
  check(`${name}.html: every <img> has alt`, imgs.every((t) => /\balt=/.test(t)),
    imgs.filter((t) => !/\balt=/.test(t)).length + ' without');
}

check('privacy.astro substitutes CONTACT', pages.find((p) => p.path === '/privacy').src.includes("replaceAll('{{CONTACT}}'"));
check('terms.astro substitutes CONTACT', pages.find((p) => p.path === '/terms').src.includes("replaceAll('{{CONTACT}}'"));
check('accessibility.astro substitutes CONTACT', pages.find((p) => p.path === '/accessibility').src.includes("replaceAll('{{CONTACT}}'"));

// ===========================================================================
section('Sitemap and robots');

{
  const robots = existsSync(join(ROOT, 'robots.txt'))
    ? readFileSync(join(ROOT, 'robots.txt'), 'utf8') : '';
  const sitemap = existsSync(join(ROOT, 'sitemap.xml'))
    ? readFileSync(join(ROOT, 'sitemap.xml'), 'utf8') : '';
  check('robots.txt exists', robots.length > 0);
  check('robots.txt points at the sitemap', robots.includes('Sitemap: https://www.brisabay.com/sitemap.xml'));
  check('sitemap.xml exists', sitemap.length > 0);
  check('sitemap uses lastmod', sitemap.includes('<lastmod>'));
  check('sitemap omits changefreq', !sitemap.includes('<changefreq>'));
  check('sitemap omits priority', !sitemap.includes('<priority>'));
  check('sitemap does not list 404', !sitemap.includes('/404'));
  for (const p of PUBLIC_PAGES) {
    const loc = canonPath(p.path);
    check(`sitemap lists ${p.path}`, sitemap.includes(`<loc>${loc}</loc>`));
  }
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  check('sitemap has loc entries', locs.length > 0);
  check('sitemap uses pretty URLs', locs.every((loc) => !loc.endsWith('.html')),
    locs.filter((loc) => loc.endsWith('.html')).join(', '));
}

// ===========================================================================
section('Stockist pages');

{
  const stockTs = readFileSync(join(ROOT, 'src/data/stockists.ts'), 'utf8');
  const cityBlock = (stockTs.match(/export const CITY_COPY[\s\S]*?\n\};\n/) || [''])[0];
  const cities = [...cityBlock.matchAll(/'([^']+)':/g)].map((m) => m[1]);
  const stateBlock = (stockTs.match(/export const STATE_COPY[\s\S]*?\n\};\n/) || [''])[0];
  const states = [...stateBlock.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);

  function splitCity(city) {
    const parts = String(city || '').split(',').map((s) => s.trim());
    return { locality: parts[0] || '', region: parts[1] || '' };
  }
  function slugCity(city) {
    const { locality, region } = splitCity(city);
    return `${locality}-${region}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  const STATE_NAME = { FL: 'Florida', GA: 'Georgia', NJ: 'New Jersey', PR: 'Puerto Rico', OH: 'Ohio' };
  function slugState(st) {
    return STATE_NAME[st].toLowerCase().replace(/\s+/g, '-');
  }

  check('city copy covers the dense markets', cities.length >= 16, `${cities.length}`);
  check('state copy covers the five regions', states.length === 5, `${states.join(',')}`);
  check('stockist route exists', existsSync(join(ROOT, 'src/pages/stockists/[slug].astro')));
  check('stockist breadcrumbs use /findBrisaBay', stockTs.includes('${ORIGIN}/findBrisaBay'));

  const locator = pages.find((p) => p.path === '/findBrisaBay').src;
  const sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
  for (const city of cities) {
    const slug = slugCity(city);
    check(`locator lists /stockists/${slug}`, locator.includes(`/stockists/${slug}`) || locator.includes('cityPages.map'));
    check(`sitemap lists /stockists/${slug}`, sitemap.includes(`<loc>${ORIGIN}/stockists/${slug}</loc>`));
  }
  for (const st of states) {
    const slug = slugState(st);
    check(`locator lists /stockists/${slug}`, locator.includes(`/stockists/${slug}`) || locator.includes('statePages.map'));
    check(`sitemap lists /stockists/${slug}`, sitemap.includes(`<loc>${ORIGIN}/stockists/${slug}</loc>`));
  }
}

// ===========================================================================
section('Wix config and leftovers');

{
  check('_headers is gone', !existsSync(join(ROOT, '_headers')));
  check('_redirects is gone', !existsSync(join(ROOT, '_redirects')));
  check('no Pages functions remain', !existsSync(join(ROOT, 'functions')));

  const cfg = JSON.parse(readFileSync(join(ROOT, 'wix.config.json'), 'utf8'));
  check('wix.config.json keeps the live siteId', cfg.siteId === 'f81bd804-9f61-4ed0-a239-a87bd5f499a0');
  check('wix.config.json keeps the live appId', cfg.appId === 'e67c40ee-b5bc-459a-9e2b-267b8cf96c85');
  check('wix.config.json has no static outputDirectory', !cfg.site || !cfg.site.outputDirectory,
    cfg.site && cfg.site.outputDirectory);
}

{
  const css = readFileSync(join(ROOT, 'src/styles/site.css'), 'utf8');
  const faces = css.match(/@font-face\s*\{[^}]+\}/g) || [];
  check('every @font-face sets font-display: swap',
    faces.length >= 2 && faces.every((b) => /font-display:\s*swap/.test(b)),
    `${faces.length} faces`);
  check('fonts are woff2', faces.every((b) => /format\('woff2'\)/.test(b)));
}

{
  const home = readFileSync(join(ROOT, 'src/partials/home.html'), 'utf8');
  check('homepage calls no instagram endpoint', !home.includes('/api/instagram') && !home.includes('loadMoments'));
  check('moment arrows use data-bb-moment-nav',
    /data-bb-moment-nav="prev"/.test(home) && /data-bb-moment-nav="next"/.test(home));
  check('moment arrows are not data-bb-moment', !/data-bb-moment="(prev|next)"/.test(home));
  check('moments viewport exists', /data-bb-moment-viewport/.test(home));
  const homeJs = readFileSync(join(ROOT, 'public/js/home.js'), 'utf8');
  check('home.js advances the carousel via data-bb-moment-nav', homeJs.includes('[data-bb-moment-nav]'));
  check('home.js sizes slides from the viewport', homeJs.includes('viewport.clientWidth'));
  check('home.js swipes the moments track', homeJs.includes('bindMomentSwipe'));
  const homeCss = readFileSync(join(ROOT, 'src/styles/home.css'), 'utf8');
  check('mobile moment card height is scoped to the track',
    /\[data-bb-moment-track\]\s*>\s*\[data-bb-moment\]/.test(homeCss));
  check('unscoped [data-bb-moment] flex rule is gone',
    !/^\s*\[data-bb-moment\]\s*\{/m.test(homeCss));
  check('mobile gallery drops transform so iOS can swipe',
    /\[data-bb-moments-gallery\]\s*\{[^}]*transform:\s*none/.test(homeCss));
  const imgs = [...home.matchAll(/src="(\/assets\/web2\/[^"]+)"/g)].map((m) => m[1]);
  const moments = imgs.filter((s) => /\/(pour|collage|vibe-|better-|every-|freshness-|intro-|keeping-)/.test(s));
  check('bottled moments ships at least six images', moments.length >= 6, `${moments.length}`);
  for (const src of moments) {
    check(`moment image exists: ${src}`, existsSync(join(ROOT, src.replace(/^\//, ''))));
  }
}

console.log('\n' + '='.repeat(60));
if (failures.length) {
  console.log(`\n${failures.length} failure(s):\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log(`\nFAILED  ${fail} of ${pass + fail} checks`);
  process.exit(1);
}
console.log(`\nPASSED  ${pass} checks across ${pages.length} pages`);
