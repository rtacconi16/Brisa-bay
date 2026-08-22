#!/usr/bin/env node
// One-shot (re-runnable) converter: pull visual HTML + helmet CSS out of the
// Design Component pages and write Astro partials. Bindings become data-
// attributes or static values; the DC runtime is not used.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_HTML = join(ROOT, 'src', 'partials');
const OUT_CSS = join(ROOT, 'src', 'styles');
mkdirSync(OUT_HTML, { recursive: true });
mkdirSync(OUT_CSS, { recursive: true });

const MOMENTS = [
  { src: '/assets/web2/vibe-chardonnay.webp', alt: 'Brisa Bay Chardonnay chilling by the pool', permalink: 'https://www.instagram.com/brisabaywines' },
  { src: '/assets/web2/collage-a.webp', alt: 'Friends clinking glasses of Brisa Bay over a picnic blanket', permalink: 'https://www.instagram.com/brisabaywines' },
  { src: '/assets/web2/collage-b.webp', alt: 'A table set with Brisa Bay bottles, white wine and small plates', permalink: 'https://www.instagram.com/brisabaywines' },
  { src: '/assets/web2/collage-c.webp', alt: 'A pool float afternoon with a bottle of Brisa Bay Sauvignon Blanc', permalink: 'https://www.instagram.com/brisabaywines' },
  { src: '/assets/web2/better-together.webp', alt: 'Sharing Brisa Bay together outdoors', permalink: 'https://www.instagram.com/brisabaywines' },
  { src: '/assets/web2/every-occasion.webp', alt: 'Brisa Bay for an easy, unplanned occasion', permalink: 'https://www.instagram.com/brisabaywines' },
  { src: '/assets/web2/freshness-first.webp', alt: 'Chilled bottles of Brisa Bay held up against a blue sky', permalink: 'https://www.instagram.com/brisabaywines' },
  { src: '/assets/web2/intro-photo.webp', alt: 'An afternoon pour of Brisa Bay in the sun', permalink: 'https://www.instagram.com/brisabaywines' },
  { src: '/assets/web2/keeping-simple.webp', alt: 'Keeping it simple with Brisa Bay', permalink: 'https://www.instagram.com/brisabaywines' },
  { src: '/assets/web2/pour/16-img-6287.webp', alt: 'Pouring Brisa Bay at the table', permalink: 'https://www.instagram.com/brisabaywines' }
];

const POUR = [
  { src: '/assets/web2/pour/15-posts-july-artboard-3.webp', alt: 'Friends toasting with Brisa Bay at a picnic', href: 'https://www.instagram.com/brisabaywines', size: 'lg', w: 1081, h: 1351 },
  { src: '/assets/web2/pour/01-3cd17d63-fdfd-431d-9ae8-edb566f92859.webp', alt: 'Bird over a Brisa Bay vineyard', href: 'https://www.instagram.com/brisabaywines', size: 'wide', w: 2304, h: 1536 },
  { src: '/assets/web2/pour/06-julio-artboard-4.webp', alt: 'Pouring Brisa Bay by the pool', href: 'https://www.instagram.com/brisabaywines', size: 'md', w: 1081, h: 1351 },
  { src: '/assets/web2/pour/08-julio-artboard-8.webp', alt: 'Brisa Bay week of bottles graphic', href: 'https://www.instagram.com/brisabaywines', size: 'sm', w: 1081, h: 1351 },
  { src: '/assets/web2/pour/12-post-10.webp', alt: 'Brisa Bay bottle balanced on a cap', href: 'https://www.instagram.com/brisabaywines', size: 'lg', w: 1081, h: 1351 },
  { src: '/assets/web2/pour/02-7e7103b6-0a1e-4d89-b2e9-365755455338.webp', alt: 'Sunset over the vineyard', href: 'https://www.instagram.com/brisabaywines', size: 'wide', w: 2306, h: 1536 },
  { src: '/assets/web2/pour/04-julio-artboard-12.webp', alt: 'Made for the moments you do not plan', href: 'https://www.instagram.com/brisabaywines', size: 'md', w: 1080, h: 1350 },
  { src: '/assets/web2/pour/10-julio-jumping-wine.webp', alt: 'Surreal Brisa Bay collage', href: 'https://www.instagram.com/brisabaywines', size: 'sm', w: 1080, h: 1350 },
  { src: '/assets/web2/pour/09-julio-dia-del-queso-2.webp', alt: 'Brisa Bay with cheese outdoors', href: 'https://www.instagram.com/brisabaywines', size: 'lg', w: 1081, h: 1351 },
  { src: '/assets/web2/pour/07-julio-artboard-7.webp', alt: 'The Brisa Times newspaper graphic', href: 'https://www.instagram.com/brisabaywines', size: 'md', w: 1081, h: 1351 },
  { src: '/assets/web2/pour/16-img-6287.webp', alt: 'Pouring Brisa Bay at the table', href: 'https://www.instagram.com/brisabaywines', size: 'sm', w: 854, h: 1280 },
  { src: '/assets/web2/pour/11-julio-polaroid.webp', alt: 'Sauvignon Blanc polaroid vineyard', href: 'https://www.instagram.com/brisabaywines', size: 'lg', w: 1081, h: 1351 },
  { src: '/assets/web2/pour/14-posts-july-artboard-1.webp', alt: 'Opening a bottle of Brisa Bay', href: 'https://www.instagram.com/brisabaywines', size: 'md', w: 1081, h: 1351 },
  { src: '/assets/web2/pour/05-julio-artboard-17.webp', alt: 'Brisa Bay Chardonnay on corks', href: 'https://www.instagram.com/brisabaywines', size: 'sm', w: 1081, h: 1351 },
  { src: '/assets/web2/pour/03-julio-artboard-11.webp', alt: 'Beach-day emoji sticker graphic', href: 'https://www.instagram.com/brisabaywines', size: 'lg', w: 1081, h: 1351 },
  { src: '/assets/web2/pour/13-post-8.webp', alt: 'Wine pouring from a polaroid into a glass', href: 'https://www.instagram.com/brisabaywines', size: 'md', w: 1081, h: 1351 }
];

function extractHelmetStyle(html) {
  const m = html.match(/<helmet>\s*<style>([\s\S]*?)<\/style>\s*<\/helmet>/);
  return m ? m[1].trim() : '';
}

function extractMain(html) {
  const m = html.match(/<main id="bb-content"[^>]*>([\s\S]*?)<\/main>/);
  if (!m) throw new Error('no main');
  return m[1].trim();
}

function prettyUrls(html) {
  return html
    .replace(/href="\/about\.html"/g, 'href="/about"')
    .replace(/href="\/ourWines\.html"/g, 'href="/ourWines"')
    .replace(/href="\/findBrisaBay\.html"/g, 'href="/findBrisaBay"')
    .replace(/href="\/privacy\.html"/g, 'href="/privacy"')
    .replace(/href="\/terms\.html"/g, 'href="/terms"')
    .replace(/href="\/accessibility\.html"/g, 'href="/accessibility"')
    .replace(/href="\/wines\.html/g, 'href="/ourWines')
    .replace(/href="\/where-to-buy\.html/g, 'href="/findBrisaBay')
    .replace(/href="\/stockists\/([^"]+)\.html"/g, 'href="/stockists/$1"')
    .replace(/href="\/ourWines#/g, 'href="/ourWines#');
}

function assetPaths(html) {
  return html
    .replace(/\bsrc="assets\//g, 'src="/assets/')
    .replace(/\bposter="assets\//g, 'poster="/assets/')
    .replace(/\bdata-bb-src="assets\//g, 'data-bb-src="/assets/')
    .replace(/url\(assets\//g, 'url(/assets/');
}

function unwrapSc(html) {
  return html
    .replace(/<sc-if\b[^>]*>/g, '')
    .replace(/<\/sc-if>/g, '');
}

function contactTokens(html) {
  return html.replace(/\{\{\s*contactEmail\s*\}\}/g, '{{CONTACT}}');
}

function common(html) {
  return contactTokens(prettyUrls(assetPaths(html)));
}

const index = readFileSync(join(ROOT, 'index.html'), 'utf8');
let home = common(extractMain(index));
home = home.replace(/animation-play-state: \{\{ play \}\}/g, 'animation-play-state: running');
home = home.replace(
  /<div data-bb-wines="" style="/,
  '<div data-bb-wines="" data-wine="0" style="'
);
home = home.replace(
  /<div data-bb-wine-panel="" style="\{\{ wine0Panel \}\}" aria-hidden="\{\{ wine0Hidden \}\}">/,
  '<div data-bb-wine-panel="" data-i="0">'
);
home = home.replace(
  /<div data-bb-wine-panel="" style="\{\{ wine1Panel \}\}" aria-hidden="\{\{ wine1Hidden \}\}">/,
  '<div data-bb-wine-panel="" data-i="1">'
);
home = home.replace(
  /<div data-bb-bottle-layer="" style="\{\{ wine0Bottle \}\}" aria-hidden="\{\{ wine0Hidden \}\}">/,
  '<div data-bb-bottle-layer="" data-i="0">'
);
home = home.replace(
  /<div data-bb-bottle-layer="" style="\{\{ wine1Bottle \}\}" aria-hidden="\{\{ wine1Hidden \}\}">/,
  '<div data-bb-bottle-layer="" data-i="1">'
);
home = home.replace(/onClick="\{\{ prevWine \}\}"/g, 'data-bb-wine="prev"');
home = home.replace(/onClick="\{\{ nextWine \}\}"/g, 'data-bb-wine="next"');
home = home.replace(
  /<div onClick="\{\{ showWine0 \}\}" role="button" aria-label="Show the Chardonnay" title="Chardonnay" style="width: clamp\(9px, 0\.7vw, 14px\); height: clamp\(9px, 0\.7vw, 14px\); border-radius: 50%; cursor: pointer; background: \{\{ dot0 \}\}"><\/div>/,
  '<div data-bb-wine="0" role="button" aria-label="Show the Chardonnay" title="Chardonnay" style="width: clamp(9px, 0.7vw, 14px); height: clamp(9px, 0.7vw, 14px); border-radius: 50%; cursor: pointer"></div>'
);
home = home.replace(
  /<div onClick="\{\{ showWine1 \}\}" role="button" aria-label="Show the Sauvignon Blanc" title="Sauvignon Blanc" style="width: clamp\(9px, 0\.7vw, 14px\); height: clamp\(9px, 0\.7vw, 14px\); border-radius: 50%; cursor: pointer; background: \{\{ dot1 \}\}"><\/div>/,
  '<div data-bb-wine="1" role="button" aria-label="Show the Sauvignon Blanc" title="Sauvignon Blanc" style="width: clamp(9px, 0.7vw, 14px); height: clamp(9px, 0.7vw, 14px); border-radius: 50%; cursor: pointer"></div>'
);
home = home.replace(
  /<div style="flex: 1; min-width: 0; overflow: hidden">/,
  '<div data-bb-moment-viewport="" style="flex: 1; min-width: 0; overflow: hidden; touch-action: pan-y">'
);
home = home.replace(/onClick="\{\{ prevMoment \}\}"/g, 'data-bb-moment-nav="prev"');
home = home.replace(/onClick="\{\{ nextMoment \}\}"/g, 'data-bb-moment-nav="next"');
const momentCards = MOMENTS.map((s) =>
  `              <a data-bb-moment="" href="${s.permalink}" target="_blank" rel="noopener" style="flex: 0 0 calc((100% - 2 * clamp(8px, 0.75vw, 14px)) / 3); height: clamp(240px, 27.6vw, 530px); background: var(--bb-map-bg); overflow: hidden; display: block; text-decoration: none">
                <img src="${s.src}" alt="${s.alt}" width="1200" height="1500" loading="lazy" style="display: block; width: 100%; height: 100%; object-fit: cover">
              </a>`
).join('\n');
home = home.replace(
  /<div style="display: flex; width: 100%; gap: clamp\(8px, 0\.75vw, 14px\); transform: \{\{ momentShift \}\}; transition: transform 0\.55s cubic-bezier\(0\.2, 0\.7, 0\.2, 1\); will-change: transform">\s*<sc-for[\s\S]*?<\/sc-for>\s*<\/div>/,
  `<div data-bb-moment-track="" style="display: flex; flex-wrap: nowrap; width: 100%; min-width: 0; gap: clamp(8px, 0.75vw, 14px); transition: transform 0.55s cubic-bezier(0.2, 0.7, 0.2, 1); will-change: transform">
${momentCards}
          </div>`
);
home = home.replace(
  /<div style="display: flex; align-items: center; justify-content: center; gap: clamp\(8px, 0\.7vw, 13px\); margin-top: clamp\(18px, 1\.8vw, 34px\)">\s*<sc-for[\s\S]*?<\/sc-for>\s*<\/div>/,
  '<div data-bb-moment-dots="" style="display: flex; align-items: center; justify-content: center; gap: clamp(8px, 0.7vw, 13px); margin-top: clamp(18px, 1.8vw, 34px)"></div>'
);
if (/\{\{/.test(home)) {
  console.error('home still has bindings:\n', home.match(/\{\{[^}]+\}\}/g));
  process.exit(1);
}

const aboutSrc = readFileSync(join(ROOT, 'about.html'), 'utf8');
let about = common(extractMain(aboutSrc));
about = about.replace(/\{\{\s*asteriskAngle\s*\}\}/g, '8');
about = about.replace(/animation-play-state: \{\{ play \}\}/g, 'animation-play-state: running');
if (/\{\{/.test(about) && !about.includes('{{CONTACT}}')) {
  console.error('about still has bindings:\n', about.match(/\{\{[^}]+\}\}/g));
  process.exit(1);
}

const winesSrc = readFileSync(join(ROOT, 'ourWines.html'), 'utf8');
let wines = common(extractMain(winesSrc));
wines = wines.replace(/data-blend="\{\{ blendAttr \}\}"/g, 'data-blend="0"');
wines = wines.replace(/animation-play-state: \{\{ play \}\}/g, 'animation-play-state: running');
wines = wines.replace(/\{\{ liveLabel \}\}/g, 'Showing Chardonnay');
wines = wines.replace(
  /style="opacity: \{\{ fade0 \}\}; transform: \{\{ shift0 \}\}; pointer-events: \{\{ pointer0 \}\}" aria-hidden="\{\{ hidden0 \}\}"/,
  'data-i="0"'
);
wines = wines.replace(
  /style="opacity: \{\{ fade1 \}\}; transform: \{\{ shift1 \}\}; pointer-events: \{\{ pointer1 \}\}" aria-hidden="\{\{ hidden1 \}\}"/,
  'data-i="1"'
);
wines = wines.replace(/aria-label="\{\{ prevLabel \}\}" title="\{\{ prevLabel \}\}" onClick="\{\{ flipBlend \}\}"/g,
  'aria-label="Show Sauvignon Blanc" title="Show Sauvignon Blanc" data-bb-wine="flip"');
wines = wines.replace(/aria-label="\{\{ nextLabel \}\}" title="\{\{ nextLabel \}\}" onClick="\{\{ flipBlend \}\}"/g,
  'aria-label="Show Sauvignon Blanc" title="Show Sauvignon Blanc" data-bb-wine="flip"');
wines = wines.replace(
  /style="position: absolute; inset: 0; pointer-events: none; opacity: \{\{ fade0 \}\}; transform: \{\{ bottleShift0 \}\}; transition: opacity 0\.45s ease, transform 0\.7s cubic-bezier\(0\.2, 0\.7, 0\.2, 1\)"/,
  'data-i="0" style="position: absolute; inset: 0; pointer-events: none; transition: opacity 0.45s ease, transform 0.7s cubic-bezier(0.2, 0.7, 0.2, 1)"'
);
wines = wines.replace(
  /style="position: absolute; inset: 0; pointer-events: none; opacity: \{\{ fade1 \}\}; transform: \{\{ bottleShift1 \}\}; transition: opacity 0\.45s ease, transform 0\.7s cubic-bezier\(0\.2, 0\.7, 0\.2, 1\)"/,
  'data-i="1" style="position: absolute; inset: 0; pointer-events: none; transition: opacity 0.45s ease, transform 0.7s cubic-bezier(0.2, 0.7, 0.2, 1)"'
);
wines = wines.replace(/aria-selected="\{\{ sel0 \}\}"/g, 'aria-selected="true"');
wines = wines.replace(/aria-selected="\{\{ sel1 \}\}"/g, 'aria-selected="false"');
wines = wines.replace(/onClick="\{\{ showChardonnay \}\}"/g, 'data-bb-wine="0"');
wines = wines.replace(/onClick="\{\{ showSauvignon \}\}"/g, 'data-bb-wine="1"');
const pourOnce = POUR.map((s) =>
  `            <a data-bb-pour-card="" data-size="${s.size}" href="${s.href}" target="_blank" rel="noopener" aria-label="${s.alt}">
              <div class="bb-pour-frame">
                <img src="${s.src}" alt="${s.alt}" width="${s.w}" height="${s.h}" loading="lazy">
              </div>
            </a>`
).join('\n');
wines = wines.replace(
  /<sc-for list="\{\{ pourShots \}\}"[\s\S]*?<\/sc-for>/,
  pourOnce + '\n' + pourOnce
);
if (/\{\{/.test(wines) && !wines.includes('{{CONTACT}}')) {
  console.error('wines still has bindings:\n', wines.match(/\{\{[^}]+\}\}/g));
  process.exit(1);
}

function policyMain(file) {
  let html = unwrapSc(common(extractMain(readFileSync(join(ROOT, file), 'utf8'))));
  html = html.replace(/\{\{\s*copyright\s*\}\}/g, '');
  return html;
}

const privacy = policyMain('privacy.html');
const terms = policyMain('terms.html');
const access = policyMain('accessibility.html');
for (const [name, html] of [['privacy', privacy], ['terms', terms], ['accessibility', access]]) {
  const leftover = html.match(/\{\{(?!CONTACT)[^}]+\}\}/g);
  if (leftover) {
    console.error(name, 'bindings', leftover);
    process.exit(1);
  }
}

function writeCss(name, fromFile, extra = '') {
  const src = readFileSync(join(ROOT, fromFile), 'utf8');
  const css = assetPaths(extractHelmetStyle(src));
  writeFileSync(join(OUT_CSS, name), css + (extra ? `\n\n${extra}\n` : '\n'));
}

const homeExtra = `
[data-bb-wines][data-wine="0"] [data-bb-wine-panel][data-i="0"],
[data-bb-wines][data-wine="0"] [data-bb-bottle-layer][data-i="0"] {
  opacity: 1; transform: none; pointer-events: auto; z-index: 2;
}
[data-bb-wines][data-wine="0"] [data-bb-wine-panel][data-i="1"] {
  opacity: 0; transform: translate3d(14px, 8px, 0); pointer-events: none; z-index: 1;
}
[data-bb-wines][data-wine="0"] [data-bb-bottle-layer][data-i="1"] {
  opacity: 0; transform: translate3d(28px, 16px, 0) rotate(4deg) scale(0.96); z-index: 1; pointer-events: none;
}
[data-bb-wines][data-wine="1"] [data-bb-wine-panel][data-i="1"],
[data-bb-wines][data-wine="1"] [data-bb-bottle-layer][data-i="1"] {
  opacity: 1; transform: none; pointer-events: auto; z-index: 2;
}
[data-bb-wines][data-wine="1"] [data-bb-wine-panel][data-i="0"] {
  opacity: 0; transform: translate3d(-14px, 8px, 0); pointer-events: none; z-index: 1;
}
[data-bb-wines][data-wine="1"] [data-bb-bottle-layer][data-i="0"] {
  opacity: 0; transform: translate3d(-28px, 16px, 0) rotate(-4deg) scale(0.96); z-index: 1; pointer-events: none;
}
[data-bb-wines] [data-bb-wine="0"],
[data-bb-wines] [data-bb-wine="1"] { background: rgba(87,84,74,0.28); }
[data-bb-wines][data-wine="0"] [data-bb-wine="0"],
[data-bb-wines][data-wine="1"] [data-bb-wine="1"] { background: var(--bb-red); }
`;

const winesExtra = `
[data-blend="0"] [data-bb-copy-panel][data-i="0"],
[data-blend="0"] [data-bottle][data-i="0"] {
  opacity: 1; transform: none; pointer-events: auto;
}
[data-blend="0"] [data-bb-copy-panel][data-i="1"],
[data-blend="0"] [data-bottle][data-i="1"] {
  opacity: 0; transform: translateY(0.16em); pointer-events: none;
}
[data-blend="0"] [data-bottle][data-i="1"] { transform: translateY(-5%) scale(0.95); }
[data-blend="1"] [data-bb-copy-panel][data-i="1"],
[data-blend="1"] [data-bottle][data-i="1"] {
  opacity: 1; transform: none; pointer-events: auto;
}
[data-blend="1"] [data-bb-copy-panel][data-i="0"],
[data-blend="1"] [data-bottle][data-i="0"] {
  opacity: 0; transform: translateY(0.16em); pointer-events: none;
}
[data-blend="1"] [data-bottle][data-i="0"] { transform: translateY(-5%) scale(0.95); }
[data-blend="0"] [data-bb-copy-panel][data-i="0"] { pointer-events: auto; }
[data-blend="1"] [data-bb-copy-panel][data-i="1"] { pointer-events: auto; }
`;

writeCss('home.css', 'index.html', homeExtra);
writeCss('about.css', 'about.html');
writeCss('wines.css', 'ourWines.html', winesExtra);
writeCss('locator.css', 'findBrisaBay.html');

writeFileSync(join(OUT_HTML, 'home.html'), home + '\n');
writeFileSync(join(OUT_HTML, 'about.html'), about + '\n');
writeFileSync(join(OUT_HTML, 'ourWines.html'), wines + '\n');
writeFileSync(join(OUT_HTML, 'privacy.html'), privacy + '\n');
writeFileSync(join(OUT_HTML, 'terms.html'), terms + '\n');
writeFileSync(join(OUT_HTML, 'accessibility.html'), access + '\n');

console.log('partials + page CSS written');
