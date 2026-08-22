# Brisa Bay

Marketing site for Brisa Bay, a Napa Valley wine label. Astro pages plus a store locator
that maps ~100 stockists. No direct shipping.

Live: **Wix Headless**, same site as before (`wix.config.json`). Pages are pretty URLs —
`/findBrisaBay`, not `/findBrisaBay.html` — because the host now runs the Astro server
adapter. Old `.html` addresses 301.

---

## Run it locally

```bash
npm install
npm run dev
```

Then open <http://localhost:4321>. Node 20+. Copy `.env.example` to `.env` if you do not
already have one — `@wix/astro` requires `WIX_CLIENT_ID` (the public OAuth app id, the
same value as `appId` in `wix.config.json`). `npm run dev` copies `assets/`, `stores.json`
and the classic locator scripts into `public/` first.

Do not open the leftover root `.html` files over `file://`. Those are the pre-Astro pages
and are not what `wix build` ships.

---

## Deploying

Review the Astro source first. When you are ready:

```bash
npm run release
```

That is `node tools/copy-public.mjs && npx @wix/cli@latest build && npx @wix/cli@latest release`.
The Wix CLI runs `astro build` with `@wix/cloud-provider-fetch-adapter`. A local
`npm run build` uses `@astrojs/node` so you can `npm run preview`.

Stay on this `siteId` / `appId`. Do not run `create headless` or `headless link`.

**Then verify the release from outside:**

```bash
node tools/verify-live.mjs
```

Everything else in `tools/` checks the repo. This is the only thing that checks what
visitors actually get. It exits non-zero on failure. It is not in CI — CI has no site to
look at.

### URL shape

Pretty URLs are the canonical form. `src/middleware.ts` 301s:

| from | to |
| --- | --- |
| `/*.html` | the same path without `.html` |
| `/wines`, `/wines.html` | `/ourWines` |
| `/where-to-buy`, `/where-to-buy.html` | `/findBrisaBay` |

Submit the pretty URLs in the Wix dashboard SEO tools. `sitemap.xml` in this repo is the
inventory; Wix may still serve its own `/sitemap.xml`.

### What Wix still owns

| Path / concern | What actually happens |
| --- | --- |
| `robots.txt`, `sitemap.xml` | **Wix often serves its own.** The files stay in the repo as the canonical URL inventory (`tools/check-pages.mjs` validates every entry). Configure crawling in the Wix dashboard, under SEO Tools. |
| Response headers | Wix sends `nosniff` and its own HSTS, and offers no way to add others. This is why the CSP is a meta tag. |
| Unknown paths | Wix may still show its own 404 chrome for URLs the Astro app never sees. `src/pages/404.astro` covers routes the adapter handles. |

Canonical host is `https://www.brisabay.com/`: Wix 301s the apex to `www`.

---

## Tests

```bash
npm test
```

That runs, in order:

```bash
node tools/test-locator.mjs
node tools/validate-stores.mjs
node tools/test-age-gate.mjs
node tools/check-pages.mjs
python3 tools/test-server.py
```

CI also runs `npm run build`. All of them exit non-zero on failure.

`test-locator.mjs` covers search ranking, distance maths, geocode filtering and store-data
integrity. Add `--live` to also exercise the real geocoder — don't do that in a loop.

`check-pages.mjs` looks at `src/`: pretty URLs, CSP match against `tools/csp.json`, one
`<h1>` per partial, sitemap inventory, no Design Component leftovers.

Warnings (missing phone numbers, coordinate precision) are reported but do not fail the
build; they need someone with the source data, not a code change.

---

## Layout

```
src/pages/           Astro routes (pretty URLs)
src/layouts/         document shell: CSP, SEO, footer, age gate, FAQ
src/components/      Nav, Footer, AgeGate, Faq
src/partials/        visual HTML extracted from the old pages
src/styles/          site.css plus per-page CSS
src/scripts/         locator-app.js — bundled so @wix/sdk is same-origin
src/data/            origin, FAQ, CSP, stockist copy

public/js/           page scripts that must stay classic (CSP: no inline JS)
age-gate.js          shared age verification, copied into public/js at build
locator-*.js         locator helpers, same
store-map.js         <store-map> Leaflet custom element
stores.json          102 stockists — fallback when CMS is unreachable
assets/              fonts, images, vendored Leaflet
tools/csp.json       the CSP, shared by site.ts and the checks
```

### How a page works

Each route is an `.astro` file that renders into `Layout.astro`. Marketing pages inject a
partial with `set:html`. There is no Design Component runtime, no `support.js`, and no
`new Function`. Client behaviour lives in `public/js/*.js` or in the bundled locator
module.

`tools/copy-public.mjs` is the only copy step: it puts `assets/`, icons, `stores.json` and
the classic locator/age-gate scripts under `public/` for Astro to serve.

---

## Conventions

### Shared code

| what | where |
|------|--------------------|
| fonts, bold reset, header/nav, links, skip link | `src/styles/site.css` |
| the brand palette (`--bb-*`) | `src/styles/site.css` |
| the FAQ list | `src/data/site.ts` |
| the contact address | `src/data/site.ts` |
| the copyright year | `src/data/site.ts`, derived from the clock |
| city/state stockist copy | `src/data/stockists.ts` |

Footer markup is `src/components/Footer.astro`. Some pages still write their own header
because the locator, home hero and legal pages pin it differently.

### Vendored dependencies

Leaflet and markercluster are served from `assets/vendor/` rather than a CDN.

```bash
./tools/vendor.sh
```

Re-downloads and verifies every file against a pinned SHA-384. To upgrade: bump the version
in the script, run it, expect a FAIL, verify the new bytes deliberately, then paste in the
reported hash. Current: Leaflet 1.9.4, markercluster 1.5.3.

`@wix/sdk` and `@wix/data` are npm dependencies, bundled into the locator module. They are
not loaded from esm.sh.

### Images and video

**Images are WebP at quality 82.** Adding a new one means converting it first — a photograph
dropped in as PNG can be 10× the size of the same image as WebP. Alpha is preserved where the
image actually uses it.

```bash
python3 -c "from PIL import Image; im=Image.open('in.png'); im.save('out.webp','WEBP',quality=82,method=6)"
```

Every `<img>` needs `width` and `height` set to the file's real pixel dimensions — that is what
reserves layout space and stops the page jumping as images arrive. Add `loading="lazy"` too,
**except** for the image that fills the top of the page: deferring that one delays the largest
paint. Today that exception is the band image on About and the hero on Our Wines. Images that
fill a fixed-size CSS box with `object-fit: cover` (the Bottled Moments tiles) don't need
dimensions — the box already reserves the space.

**The hero video** is H.264, 24fps, no audio track, `+faststart` so playback begins before the
download finishes:

```bash
ffmpeg -i master.mp4 -an -r 24 -c:v libx264 -crf 32 -preset slow \
       -profile:v high -pix_fmt yuv420p -movflags +faststart -g 48 assets/web2/hero-video.mp4
```

Regenerate `hero-poster.jpg` alongside it (`-frames:v 1` at `-ss 0`) — it is what paints while
the video streams in.

The 29MB master is not in the working tree. It is in git history —
`git show d78d287:assets/web2/hero-video.mp4` — so re-encode from there rather than from the
shipped file, which would compound generation loss.

---

## Security headers

**Wix sends no security headers and provides no way to add them.** The
`<meta http-equiv="Content-Security-Policy">` tag in `Layout.astro` is the entire policy
production enforces.

`tools/csp.json` is the single source of truth. `src/data/site.ts` re-exports the same
strings; `tools/check-pages.mjs` and `tools/test-server.py` fail if they drift. Change the
policy in `tools/csp.json` and `src/data/site.ts` together.

Two policies exist. Everything gets `base`, which reaches nothing off-origin. Only
`/findBrisaBay` gets `locator`, which additionally allows the basemap tiles, the geocoder,
and the Wix Data API the Stockists collection is read through.

**What production does not get, and cannot:**

- **`frame-ancestors` is ignored in a meta tag**, and `X-Frame-Options` is header-only.
  **The site is framable and clickjacking is not mitigated.** There is no fix available
  from inside this repo — it needs a host that can set response headers.
- `Referrer-Policy` and `Permissions-Policy` are header-only too.

`script-src` is `'self'` only — no `'unsafe-eval'`, no esm.sh. Inline `style` attributes
still need `style-src 'unsafe-inline'`. Inline `<script>` blocks are not allowed; page JS
belongs in an external file or an Astro bundled module.

---

## Known gaps

Deliberate, known, and written down so they aren't rediscovered as surprises.

**Map and geocoding are not production-licensed.** `locator-config.js` points at
OpenStreetMap's tile servers and Komoot's public Photon instance. Both are donated
infrastructure with fair-use terms that do not cover commercial use. Before any real
traffic, move to a contracted provider — the config is structured so it's a two-value
change.

**Bottled Moments is curated, not live.** The gallery ships in `src/partials/home.html`.
Making it live means a service that writes the images into the page at build time.

**No responsive images.** Every image ships one size to every device.

**`stores.json` has no phone or website data.** Both fields are threaded through the list
rows, map popups and `tel:` links, and are populated on 0 of 102 records. The code is
ready; the data isn't.

**Contact form exists in Wix, not on any page.** Adding it means widening `connect-src`
and `form-action` in `tools/csp.json`.

---

## Before you push

Run `npm test` and `npm run build`. Check the page in a browser through `npm run dev`.
Do not `wix release` until the Astro migration has been reviewed.
