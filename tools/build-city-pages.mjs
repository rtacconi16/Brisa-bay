#!/usr/bin/env node
// Generate static city / state stockist pages from stores.json, then rewrite
// sitemap.xml. Commit the output — Cloudflare Pages has no build step.
//
//   node tools/build-city-pages.mjs
//
// Unique copy lives in this file on purpose. Near-identical pages with a
// swapped place name are doorway pages; if a city cannot support its own
// paragraph it does not get a page.

import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://brisabay.com';
const OUT = join(ROOT, 'stockists');
const LASTMOD = '2026-08-15';

const TYPE_MAP = {
  'Liquor Store': 'LiquorStore',
  'Grocery': 'GroceryStore',
  'Restaurant': 'Restaurant',
  'Café': 'CafeOrCoffeeShop',
  'Wine Bar': 'BarOrPub',
  'Golf Course': 'GolfCourse',
  'Country Club': 'SportsActivityLocation',
  'Yacht Club': 'SportsActivityLocation'
};

const STATE_NAME = {
  FL: 'Florida', GA: 'Georgia', NJ: 'New Jersey', PR: 'Puerto Rico', OH: 'Ohio',
  NY: 'New York', AZ: 'Arizona'
};

const CITY_COPY = {
  'Atlanta, GA': 'Atlanta is Brisa Bay’s deepest pocket in the South — nine shops, restaurants and clubs from Midtown to the perimeter, where a Napa bottle sits next to Georgia produce rather than behind a velvet rope. Look for us at independent grocers and rooms that pour by the glass when the weather finally breaks.',
  'San Juan, PR': 'San Juan was an early home for the brand outside the mainland. Six accounts around the capital pour Brisa Bay the way the island drinks wine: cold, with food, and without a lecture. Ask at the grocer or the restaurant that already has a white on the list.',
  'Boca Raton, FL': 'Boca Raton’s five stockists run from a yacht club to neighborhood markets along the Federal Highway strip. This is Florida lunch-into-dinner wine — Chardonnay for a long table, Sauvignon Blanc for the first hot afternoon that feels like summer in January.',
  'Decatur, GA': 'Decatur sits just east of Atlanta and drinks like a small town that happens to have serious grocery. Four independent shops here carry both bottles; it is one of the easiest places in Georgia to walk out with Brisa Bay the same day you decide you want it.',
  'Miami, FL': 'Miami’s three stockists are groceries first — the kind of stores where you grab citrus, a baguette and a cold white without making an evening of it. That is the point of the wine. If you are already in town, start here before you drive north.',
  'Cumming, GA': 'Cumming, north of Atlanta, has three accounts that treat Napa wine as a weeknight grocery item. No tasting room appointment. If you are in Forsyth County, these are the shelves to check.',
  'Long Branch, NJ': 'Long Branch sits on the Jersey Shore, and the three shops here make sense of a coastal white: cold Sauvignon Blanc after the beach, Chardonnay when dinner runs late. The same bottle you would open in Napa, sold like any other good grocery find.',
  'Red Bank, NJ': 'Red Bank’s three stockists serve a river town that already knows how to eat. Independent shops and restaurants here are why Brisa Bay shows up on the Shore without a distributor song-and-dance at the table.',
  'Columbus, OH': 'Columbus is the Midwest foothold — three accounts in a city that buys wine at the grocery store and drinks it the same night. If you are looking between the coasts, start here rather than assuming Napa never left California.',
  'Caguas, PR': 'Caguas, inland from San Juan, has three shops that carry the wines for people who are not on vacation. Same bottles, less tourist traffic, still cold from the fridge.',
  'Palm Beach Gardens, FL': 'Palm Beach Gardens has two stockists for the north-county crowd that would rather pick up a bottle on the way home than book a tasting. Check both before you drive down to West Palm.',
  'West Palm Beach, FL': 'West Palm Beach’s two accounts sit in the county’s everyday shopping pattern — groceries and a specialty shop, not a destination winery. Useful if you are staying in town and want Napa without the ceremony.',
  'Delray Beach, FL': 'Delray Beach drinks outside. Two shops here cover the Atlantic Avenue orbit: one for the picnic, one for the restaurant that already has whites by the glass.',
  'Avondale Estates, GA': 'Avondale Estates is a two-shop town just east of Decatur. If Atlanta’s bigger list feels like a project, this is the smaller, walkable version of the same idea.',
  'Asbury Park, NJ': 'Asbury Park’s two stockists match a boardwalk town that stays up late. Cold white wine, not cellar talk — the Shore version of skip-the-cellar.',
  'Naranjito, PR': 'Naranjito is a small inland town with two shops carrying Brisa Bay. It is not on a visitor itinerary, which is exactly why the wine belongs on those shelves.'
};

const STATE_COPY = {
  FL: 'Florida is Brisa Bay’s largest state by account count, stretched from the Panhandle to the Keys. The city pages below cover the denser pockets; everywhere else is a single shop — still worth a call if you are nearby, and still on the map at Where to Buy.',
  GA: 'Georgia is the Atlanta metro, mostly: the city itself, Decatur, Cumming and Avondale Estates have their own pages. The one-off shops in the rest of the metro are listed here so a trip to Johns Creek or Marietta is not a dead end.',
  NJ: 'New Jersey is a Shore and a North Jersey story. Long Branch, Red Bank and Asbury Park have enough accounts for their own pages; the rest of the state is a single shop in each town, collected below.',
  PR: 'Puerto Rico is the largest island footprint — San Juan, Caguas and Naranjito first, then a scatter of north-coast and mountain-town shops. If you are not in those three cities, start with the list on this page.',
  OH: 'Ohio is Columbus plus one neighboring shop in Westerville. The city page covers the three Columbus accounts; Westerville is here so the state is not a dead end if you live one suburb over.'
};

const data = JSON.parse(readFileSync(join(ROOT, 'stores.json'), 'utf8'));
const stores = data.stores;

function splitCity(city) {
  const parts = String(city || '').split(',').map((s) => s.trim());
  return { locality: parts[0] || '', region: parts[1] || '' };
}

function slugCity(city) {
  const { locality, region } = splitCity(city);
  return `${locality}-${region}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function slugState(st) {
  return STATE_NAME[st].toLowerCase().replace(/\s+/g, '-');
}

function storeNode(s) {
  const { locality, region } = splitCity(s.city);
  const node = {
    '@type': TYPE_MAP[s.type] || 'Store',
    name: s.name,
    address: {
      '@type': 'PostalAddress',
      streetAddress: s.address,
      addressLocality: locality,
      addressRegion: region,
      addressCountry: region === 'PR' ? 'PR' : 'US'
    },
    geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng }
  };
  if (s.phone) node.telephone = s.phone;
  if (s.url) node.url = s.url;
  return node;
}

function itemListJsonLd(name, description, list) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    description,
    numberOfItems: list.length,
    itemListElement: list.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: storeNode(s)
    }))
  };
}

function breadcrumbJsonLd(name, path) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Where to Buy', item: `${ORIGIN}/where-to-buy.html` },
      { '@type': 'ListItem', position: 3, name, item: `${ORIGIN}/${path}` }
    ]
  };
}

function storeRows(list) {
  return list.map((s) => {
    const phone = s.phone
      ? `<p><a href="tel:${s.phone.replace(/[^\d+]/g, '')}">${esc(s.phone)}</a></p>`
      : '';
    return `<li>
  <h2>${esc(s.name)}</h2>
  <p>${esc(s.type)} · ${esc(s.address)}, ${esc(s.city)}</p>
  ${phone}
</li>`;
  }).join('\n');
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page({ title, description, canonicalPath, h1, lead, extraHtml, list, jsonName, jsonDesc }) {
  const canonical = `${ORIGIN}/${canonicalPath}`;
  const ld1 = JSON.stringify(itemListJsonLd(jsonName, jsonDesc, list));
  const ld2 = JSON.stringify(breadcrumbJsonLd(h1, canonicalPath));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#60b98f">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="../favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="../apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Brisa Bay">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ORIGIN}/assets/web2/og-locator.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${ORIGIN}/assets/web2/og-locator.jpg">
<link rel="stylesheet" href="../site.css?v=3">
<link rel="preload" href="../assets/fonts/AGaramondPro-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="../assets/fonts/OldNewspaperTypes.woff2" as="font" type="font/woff2" crossorigin>
<script type="application/ld+json">${ld1}</script>
<script type="application/ld+json">${ld2}</script>
</head>
<body style="margin:0;background:var(--bb-cream)">
<a data-bb-skiplink="" href="#bb-content">Skip to main content</a>
<div style="width:100%;max-width:1920px;margin:0 auto;background:var(--bb-cream);font-family:'Garamond Pro',serif;color:var(--bb-ink)">
  <main id="bb-content" tabindex="-1">
    <div style="background:var(--bb-dark);padding:clamp(20px,3vw,44px) clamp(20px,4.7vw,90px) clamp(40px,5vw,72px);box-sizing:border-box">
      <div data-bb-nav="" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:clamp(12px,2vw,40px)">
        <a href="../index.html" data-bb-wordmark="">Brisa Bay</a>
        <div role="navigation" aria-label="Main">
          <a href="../about.html">About us</a>
          <a href="../blends.html">Our Wines</a>
          <a href="../where-to-buy.html">Where to buy</a>
        </div>
      </div>
      <h1 style="margin:clamp(36px,5vw,72px) 0 0;font-family:'Old Newspaper',serif;font-size:clamp(32px,4.6vw,72px);line-height:1.08;font-weight:400;letter-spacing:0.03em;color:var(--bb-cream)">${esc(h1)}</h1>
    </div>
    <div style="padding:clamp(36px,5vw,80px) clamp(20px,5vw,190px) clamp(64px,8vw,120px);box-sizing:border-box">
      <p style="margin:0 0 28px;max-width:46em;font-size:clamp(18px,1.7vw,28px);line-height:1.45">${esc(lead)}</p>
      <p style="margin:0 0 36px;font-size:clamp(16px,1.4vw,22px)"><a href="../blends.html#chardonnay">Chardonnay</a> · <a href="../blends.html#sauvignon-blanc">Sauvignon Blanc</a> · <a href="../where-to-buy.html">Full locator</a></p>
      ${extraHtml || ''}
      <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:22px">
        ${storeRows(list)}
      </ul>
    </div>
  </main>
  <div role="contentinfo" style="background:var(--bb-sage);padding:clamp(40px,5vw,80px) clamp(20px,5vw,190px);box-sizing:border-box;color:var(--bb-cream)">
    <div style="font-size:clamp(36px,6vw,96px);line-height:1">Brisa Bay</div>
    <p style="margin:16px 0 0;font-size:clamp(15px,1.4vw,22px)"><a href="../privacy.html" style="color:inherit">Privacy</a> · <a href="../terms.html" style="color:inherit">Terms</a> · <a href="../accessibility.html" style="color:inherit">Accessibility</a></p>
  </div>
</div>
</body>
</html>
`;
}

const byCity = new Map();
for (const s of stores) {
  if (!byCity.has(s.city)) byCity.set(s.city, []);
  byCity.get(s.city).push(s);
}

const cityPages = [...byCity.entries()]
  .filter(([, list]) => list.length >= 2)
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

for (const [city] of cityPages) {
  if (!CITY_COPY[city]) {
    console.error(`missing unique copy for ${city}`);
    process.exit(1);
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const written = [];

for (const [city, list] of cityPages) {
  const { locality, region } = splitCity(city);
  const slug = slugCity(city);
  const path = `stockists/${slug}.html`;
  const title = `Where to Buy Brisa Bay in ${locality}, ${region}`;
  const description = `Find Brisa Bay Napa Valley Chardonnay and Sauvignon Blanc in ${locality}, ${region}. ${list.length} stockists with addresses.`;
  writeFileSync(join(ROOT, path), page({
    title,
    description,
    canonicalPath: path,
    h1: `Brisa Bay in ${locality}`,
    lead: CITY_COPY[city],
    list,
    jsonName: `Brisa Bay stockists in ${locality}, ${region}`,
    jsonDesc: `Shops, bars and restaurants carrying Brisa Bay in ${locality}.`
  }));
  written.push({ loc: `${ORIGIN}/${path}`, kind: 'city', city, n: list.length });
}

const citySet = new Set(cityPages.map(([c]) => c));
const byState = new Map();
for (const s of stores) {
  const st = splitCity(s.city).region;
  if (!STATE_COPY[st]) continue;
  if (!byState.has(st)) byState.set(st, []);
  byState.get(st).push(s);
}

for (const [st, list] of [...byState.entries()].sort()) {
  const singles = list.filter((s) => !citySet.has(s.city));
  const cityLinks = cityPages
    .filter(([c]) => splitCity(c).region === st)
    .map(([c, clist]) => {
      const { locality } = splitCity(c);
      return `<li><a href="${slugCity(c)}.html">${esc(locality)}</a> — ${clist.length} stockists</li>`;
    }).join('\n');
  const extraHtml = cityLinks
    ? `<h2 style="font-family:'Old Newspaper',serif;font-weight:400;font-size:clamp(22px,2.4vw,36px)">Cities with their own pages</h2>
       <ul style="margin:0 0 36px;padding-left:1.2em;font-size:clamp(16px,1.5vw,24px)">${cityLinks}</ul>
       <h2 style="font-family:'Old Newspaper',serif;font-weight:400;font-size:clamp(22px,2.4vw,36px)">Other ${esc(STATE_NAME[st])} stockists</h2>`
    : '';
  const path = `stockists/${slugState(st)}.html`;
  const title = `Where to Buy Brisa Bay in ${STATE_NAME[st]}`;
  const description = `Brisa Bay Napa Valley wine stockists across ${STATE_NAME[st]}. City pages for the denser markets, plus every other shop in the state.`;
  writeFileSync(join(ROOT, path), page({
    title,
    description,
    canonicalPath: path,
    h1: `Brisa Bay in ${STATE_NAME[st]}`,
    lead: STATE_COPY[st],
    extraHtml,
    list: singles.length ? singles : list,
    jsonName: `Brisa Bay stockists in ${STATE_NAME[st]}`,
    jsonDesc: `Shops carrying Brisa Bay Napa Valley wine in ${STATE_NAME[st]}.`
  }));
  written.push({ loc: `${ORIGIN}/${path}`, kind: 'state', city: STATE_NAME[st], n: (singles.length || list.length) });
}

const publicPages = [
  { loc: `${ORIGIN}/`, lastmod: LASTMOD },
  { loc: `${ORIGIN}/about.html`, lastmod: LASTMOD },
  { loc: `${ORIGIN}/blends.html`, lastmod: LASTMOD },
  { loc: `${ORIGIN}/where-to-buy.html`, lastmod: LASTMOD },
  { loc: `${ORIGIN}/privacy.html`, lastmod: LASTMOD },
  { loc: `${ORIGIN}/terms.html`, lastmod: LASTMOD },
  { loc: `${ORIGIN}/accessibility.html`, lastmod: LASTMOD },
  ...written.map((w) => ({ loc: w.loc, lastmod: data.updated || LASTMOD }))
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${publicPages.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
  </url>`).join('\n')}
</urlset>
`;
writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);

console.log(`wrote ${written.length} stockist pages and sitemap.xml`);
for (const w of written) console.log(`  ${w.kind.padEnd(5)} ${String(w.n).padStart(2)}  ${w.loc}`);
