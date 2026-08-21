# Getting Brisa Bay Indexed

**Brisa Bay — SEO remediation plan**

The site's on-page SEO is already good. It is pointed at a domain that serves someone else's placeholder, which cancels nearly all of it. Seven phases, in dependency order.

| | |
|---|---|
| Audited against | `bf8a6c8` |
| Scope | 17 findings → 7 phases |
| Live today | `rtacconi16.github.io/Brisa-bay` |
| Date | 15 August 2026 |

---

## Hosting decision — asked and answered

### Move to Cloudflare Pages, and point brisabay.com at it.

GitHub Pages is the wrong host for *this* site, and the repo says so itself. `server.py` sends CSP, `X-Frame-Options`, `Permissions-Policy` and `Referrer-Policy`, and serves `/api/instagram/moments`. GitHub Pages supports none of it — no custom headers, no server code, no redirects. That is why the CSP is written twice (the `<meta>` copy cannot carry `frame-ancestors`), why production ships the fallback gallery instead of the real Instagram feed, and why there is no `www`→apex 301.

Cloudflare Pages keeps the no-build-step workflow and deploys from the same `main`, while closing all of it: `_headers` makes `server.py`'s headers real in production, `_redirects` handles canonicalisation, Pages Functions can host the Instagram endpoint with real secrets, and unmetered bandwidth matters when a single visit pulls a 4.7 MB hero video. Netlify matches it on features but meters bandwidth on the free tier. Confirm both tiers' current limits before committing.

A useful side effect: `tools/check-pages.mjs` already hard-asserts `https://brisabay.com/` in every canonical, `og:url`, `og:image` and sitemap entry. Keeping the real domain means those assertions stay correct as written. The github.io fallback would have required rewriting the test suite as well as ~40 URLs.

---

## Coverage

Every finding from the audit, and where it gets resolved. Nothing is dropped; two items are already correct and are listed so they stay that way.

| # | Finding | Severity | Phase |
|---|---------|----------|-------|
| 1 | Canonicals point at a domain serving a GoDaddy placeholder | Critical | 0 |
| 2 | `robots.txt` / `sitemap.xml` unreachable on a project subpath | Critical | 0 → 1 |
| 3 | `og:image` 404s at the advertised host | Critical | 0 → 1 |
| 4 | Age-gate user-agent sniffing (cloaking risk) | High | 2 |
| 5 | 4.7 MB hero video with `preload="auto"` | High | 3 |
| 6 | Fonts ship as `.otf` + `.ttf`, ~199 KB | High | 3 |
| 7 | No city landing pages for 102 stockists | Medium | 5 |
| 8 | Thin static HTML (199–455 words pre-JS) | Medium | 4 → 5 |
| 9 | Sitemap has no `lastmod` | Medium | 1 |
| 10 | Product markup has no offers; both wines share one URL | Medium | 4 |
| 11 | `FAQPage` won't earn rich results post-2023 | Medium | 4 |
| 12 | One generic `og:image` for all 7 pages; no breadcrumbs | Medium | 4 |
| 13 | 404 handling correct — `noindex` + real 404 status | Verify | 1 |
| 14 | `story-photo.webp` (153 KB) fetched twice on the homepage | Low | 3 |
| 15 | `safari-check` disallow is redundant — page is already `noindex` | Low | 1 |
| 16 | `lang="en"` on all 8 pages — correct | Keep | — |
| 17 | Cache capped at `max-age=600`; `?v=` busting mostly moot | Low | 0 |

---

## The phases

Numbered because they are a real dependency chain, not a priority ranking. Phase 0 unblocks 1, 4 and 5; everything else can run in any order once it lands.

---

## Phase 0 — Move the site to its own domain

> Findings 1, 2, 3 and 17 share one root cause. This phase is worth more than every phase below it combined.

**Effort:** ~half a day + DNS propagation · **Blocks:** Phases 1, 4, 5

### 0.1 Create the Cloudflare Pages project

Connect `rtacconi16/Brisa-bay`, production branch `main`, build command empty, output directory `/`. Confirm the `*.pages.dev` preview renders the homepage, the locator loads 102 stores, and the age gate behaves.

### 0.2 Port `server.py`'s headers into `_headers`

This is the change that makes the local-only security posture real in production.

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self' https://photon.komoot.io; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=(), usb=()
  X-Frame-Options: DENY
  Strict-Transport-Security: max-age=63072000; includeSubDomains

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

The `/assets/*` rule resolves finding 17 for images, fonts and vendored JS. Leave HTML on a short TTL.

> **Test consequence:** `tools/test-server.py` checks the CSP in `server.py` against the `<meta>` copy in every page. Point that comparison at `_headers` instead, or it will pass while checking the wrong thing.

### 0.3 Repoint DNS

Lower the TTL on the current GoDaddy records first and let the old value expire, then move the nameservers to Cloudflare (cleanest, since Pages is there) or add the records GoDaddy-side. Attach both apex and `www` to the Pages project and wait for the certificate to issue.

> **Rollback:** leave the GitHub Pages deployment enabled until the new domain has served correctly for a day. Reverting is then a nameserver change, not a rebuild.

### 0.4 Add `_redirects` for canonicalisation

One host, one URL per page — the thing GitHub Pages could never do.

```
https://www.brisabay.com/*  https://brisabay.com/:splat  301
```

### 0.5 Drop the `<meta>` CSP from all seven pages

Once the real header ships, the duplicate is strictly worse than nothing: it cannot express `frame-ancestors`, and it is a second copy of a policy that has already drifted once.

- **Touches:** `index` · `about` · `wines` · `where-to-buy` · `privacy` · `terms` · `accessibility`
- **Verify:** `node tools/check-pages.mjs` · `python3 tools/test-server.py`

### 0.6 Port the Instagram endpoint (optional, defer if you like)

`functions/api/instagram/moments.js` with the two `.env` values as Pages secrets. Until then the curated fallback keeps serving, exactly as it does today — so this does not block the domain move.

### 0.7 Retire the GoDaddy placeholder

So "Savor the Flavor" and its *"placeholder content coming soon… focused on web development solutions"* description stop being what the brand's domain says.

**Done when**

- `curl -sI https://brisabay.com/` shows Cloudflare and the full header set
- `curl -sI https://brisabay.com/assets/web2/og-share.jpg` returns 200
- Every canonical is self-referential — no cross-origin canonical anywhere

---

## Phase 1 — Turn crawling on

> Files that already exist and are already correct start being read for the first time. Mostly verification, one small edit.

**Effort:** ~2 hours · **Needs:** Phase 0

### 1.1 Simplify `robots.txt`

It now resolves at the host root, so its rules finally apply. Drop the `Disallow` lines for `safari-check` — the page already carries `noindex, nofollow`, and `Disallow` actively prevents crawlers from *seeing* that directive. Keep `Allow: /` and the `Sitemap:` line.

> **Test consequence:** `tools/check-pages.mjs` asserts `robots.txt disallows safari-check.html`. Replace that assertion with one that checks the page is `noindex` — which the suite already does a few lines further down.

### 1.2 Rework `sitemap.xml`

Add `<lastmod>` to every entry — it is the one hint Google actually consumes. Drop `changefreq` and `priority`, which it ignores.

### 1.3 Register with the search engines

Verify the domain in Google Search Console and Bing Webmaster Tools, submit the sitemap, and request indexing for all seven pages. Use the URL Inspection tool's rendered-HTML view to confirm Google sees the full page behind the age gate — this is also the evidence that Phase 2 is safe to do.

### 1.4 Re-validate the share cards

Run the homepage and `wines.html` through Facebook's and LinkedIn's debuggers to flush their caches of the 404 image, and confirm 1200×630 renders.

### 1.5 Re-confirm the 404 (finding 13)

GitHub Pages served `404.html` with a real 404 status. Verify Cloudflare Pages does the same rather than a 200 — a soft 404 quietly pollutes the index.

```bash
curl -sI https://brisabay.com/nope-does-not-exist | head -1
```

---

## Phase 2 — Remove the cloaking risk

> Delete code. The behaviour it protects already works without it.

**Effort:** ~1 hour · **Independent**

### 2.1 Strip the user-agent allowlist from `age-gate.js`

Remove `CRAWLER_UA` and `isCrawler()`, drop the `isCrawler()` short-circuit at the top of `readOk()`, and remove it from the exported object. The gate keeps `#bb-content` in the DOM as `inert` rather than `display:none`, so a rendering crawler indexes the page either way — confirmed live: 1,867 characters of content text present while the gate is open. The sniff buys nothing and is trivially spoofable.

- **Touches:** `age-gate.js` (lines 7, 22, 152) — bump `?v=3` → `?v=4` in all seven pages
- **Touches:** `tools/test-age-gate.mjs` — 3 assertions at lines 133, 137, 141
- **Verify:** `node tools/test-age-gate.mjs` · `node tools/check-pages.mjs`

> **Sequencing:** easiest to do after 1.3, so you have Search Console's rendered-HTML screenshot as proof the content indexes without the bypass.

---

## Phase 3 — Cut the page weight

> Core Web Vitals are a ranking input, and this site's are dominated by three fixable things.

**Effort:** ~half a day · **Independent**

### 3.1 Stop force-downloading the hero video

`index.html:647` sets `preload="auto"` on a 4.7 MB MP4 in the LCP viewport. Switch to `preload="none"` — the 116 KB poster already carries first paint — then re-encode toward a ≤1.5 MB target and add a WebM/AV1 source alongside the MP4.

### 3.2 Convert both fonts to WOFF2

115 KB OTF + 84 KB TTF becomes roughly 60 KB total. Update the two `@font-face` blocks in `site.css` to `format('woff2')`, bump `site.css?v=2` → `?v=3` everywhere, and add a `<link rel="preload" as="font" type="font/woff2" crossorigin>` for each face.

> **Keep:** `font-display: swap` on both blocks — `check-pages.mjs` asserts it, and it is the right setting regardless.

### 3.3 Deduplicate `story-photo.webp`

Referenced at `index.html:691` and again in the Instagram fallback gallery at `index.html:1477`; the browser fetched 153 KB twice. Either reuse the first URL or give the gallery its own image.

### 3.4 Measure, don't assume

Capture LCP, CLS and total transfer on a throttled mobile profile before and after. Homepage baseline as measured: 853 KB across 14 requests, before the video finishes streaming.

---

## Phase 4 — Deepen the markup

> Structured data and per-page metadata. Smaller wins, and one place where the honest answer is to do less.

**Effort:** ~1 day · **Needs:** Phase 0

### 4.1 Give each wine its own URL

Both `Product` nodes in `seo.js` currently point at `wines.html`, so neither can rank as a distinct entity. Split into `chardonnay.html` and `sauvignon-blanc.html`, or at minimum give each a stable anchor and use it in the markup.

### 4.2 On `offers`: don't fake it

Product rich results generally need price and availability, and Brisa Bay does not sell direct — inventing offers to trigger a rich result is exactly what the spam policies target. The legitimate version is an `Offer` with `availableAtOrFrom` pointing at real stockists, which becomes natural once Phase 5 gives those stockists URLs. Until then, keep the markup honest and accept no product rich result.

### 4.3 Add `BreadcrumbList`

To the interior pages, emitted from `seo.js` alongside the existing nodes so it stays in one place.

### 4.4 Per-page `og:image`

One share card across seven pages means every link looks identical. Bottle shot for `wines`, story photo for `about`, a map crop for `where-to-buy`.

### 4.5 Keep `FAQPage`, lower expectations

Google restricted FAQ rich results to government and health sites in August 2023. It costs nothing, stays accurate against `site-data.js`, and still feeds answer engines — just don't count it as a win.

### 4.6 Reconsider the visually-hidden `h1`

`index.html:637` hides the homepage's only `h1` because the hero is a full-bleed film. That is legitimate and well-commented — but it means the page's strongest heading signal is invisible to humans. Worth revisiting whether the story section could carry a visible one.

---

## Phase 5 — City landing pages

> The growth work. "Where to buy [wine] in [city]" is the highest-intent query this brand can win, and 102 stockists currently share one page.

**Effort:** ~2–3 days · **Needs:** Phase 0

### 5.1 Pick the cities on evidence

From `stores.json`: Atlanta 9, San Juan PR 6, Boca Raton 5, Decatur 4, then Miami, Cumming, Long Branch, Red Bank and Columbus at 3 each. A threshold of two or more stockists yields a workable set; single-store cities roll up into a state page rather than getting their own.

### 5.2 Generate, then commit the output

A `tools/build-city-pages.mjs` that reads `stores.json` and writes `/stockists/atlanta-ga.html` and friends. The generated files get committed — the repo's rule is that what is in the repo is what ships, and Cloudflare Pages is running no build step.

### 5.3 Make each page worth its URL

Real stockist list with addresses and phone numbers, a genuine paragraph about that city, links to both wines, and city-scoped `ItemList` JSON-LD reusing `locator-jsonld.js`'s existing `TYPE_MAP`.

> **Real risk:** near-identical city pages with a swapped place name are doorway pages under Google's spam policies, and they get demoted as a group. If a city cannot support unique content, it does not get a page. Nine strong pages beat forty thin ones.

### 5.4 Wire them into the site

Link from `where-to-buy.html` so they are crawlable without the sitemap, add every generated URL to `sitemap.xml`, and extend the sitemap assertions in `check-pages.mjs` to cover them.

### 5.5 This also fixes finding 8

These pages are static HTML with real text, which is what makes the stockist data legible to the crawlers that don't execute JavaScript — Bing, social scrapers, and the LLM crawlers that currently see 199 words on `where-to-buy.html`.

---

## Phase 6 — Keep it from regressing

> Everything above is a one-time fix. This is what stops finding 1 from happening again.

**Effort:** ~half a day · **Do last**

### 6.1 Land the CI workflow

README records it as written and verified but unpushable without the `workflow` OAuth scope. Five test tools that nothing runs automatically is how a silent SEO regression ships.

```bash
gh auth refresh -s workflow
```

### 6.2 Extend the SEO section of `check-pages.mjs`

It already covers titles, descriptions, canonicals, `og:` tags and script order. Add:

- every canonical is self-referential rather than merely on the right host
- titles and descriptions are unique across pages and within length bounds
- every non-`noindex` page appears in the sitemap
- every sitemap entry resolves to a file

### 6.3 Review Search Console monthly

For coverage, Core Web Vitals and the queries the city pages start winning.

---

## Sequencing

Phase 0 first and alone; it is the dependency for half the plan and the only phase with a rollback story worth writing down. After that, 2 and 3 are independent and can be done in any gap.

| Phase | Effort |
|-------|--------|
| 0 — Domain and hosting | 0.5 d |
| 1 — Turn crawling on | 2 h |
| 2 — Remove cloaking risk | 1 h |
| 3 — Cut page weight | 0.5 d |
| 4 — Deepen the markup | 1 d |
| 5 — City landing pages | 2–3 d |
| 6 — Keep it from regressing | 0.5 d |

Effort is work within a phase, not calendar time — Phase 0's half-day is followed by DNS propagation you spend waiting rather than working.

---

## Standing rules

The repo's own conventions, which every phase above inherits.

- Bump the `?v=` string in *every* page that references a JS or CSS file whenever that file changes. There is no build step to do it for you.
- Run all five tools before pushing: `test-locator`, `validate-stores`, `test-age-gate`, `check-pages`, `test-server`. They exit non-zero and work as a build gate.
- No inline `<script>` — the CSP blocks it locally by design. Page JavaScript goes in an external file.
- Shared content belongs in `site-data.js` or `site.css`, not copied across seven pages.

---

*Audited against `bf8a6c8` · findings verified against the live deployment · 15 August 2026*
