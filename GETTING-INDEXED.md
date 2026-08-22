# Getting Brisa Bay Indexed

**Brisa Bay — SEO remediation plan**

> **Status, 21 August 2026 — Phase 0 is done, but not the way this document plans it.**
> The site is on **Wix**, not Cloudflare Pages. The hosting section and Phase 0 below have
> been rewritten to record what actually happened; **do not follow the original Cloudflare
> steps** — several of them would break the site as it now stands. Phases 1 onward are
> hosting-independent and still apply, with one change throughout: the canonical host is
> `https://www.brisabay.com/`, and page URLs end in `.html`.

The site's on-page SEO is already good. It is pointed at a domain that serves someone else's placeholder, which cancels nearly all of it. Seven phases, in dependency order.

| | |
|---|---|
| Audited against | `bf8a6c8` |
| Scope | 17 findings → 7 phases |
| Live today | `rtacconi16.github.io/Brisa-bay` |
| Date | 15 August 2026 |

---

## Hosting decision — asked, answered, then overtaken

### The site went to Wix.

The original recommendation here was Cloudflare Pages, for good reasons: `_headers` would
have made `server.py`'s security headers real, `_redirects` would have handled
canonicalisation, and Pages Functions could have hosted the Instagram endpoint. That is not
what happened. The site is served by Wix, released with the Wix CLI, with the stockists in a
Wix CMS collection.

What that costs, recorded plainly because each one was a working feature that no longer is:

| Wanted | On Wix |
|---|---|
| Real security headers | **Not available.** No `_headers`, no dashboard setting. The CSP is a `<meta>` tag, so `frame-ancestors` and `X-Frame-Options` are simply absent and clickjacking is unmitigated. |
| 301 canonicalisation | **Not available** for uploaded files. `where-to-buy.html` and `wines.html` are stub pages that redirect client-side. |
| Serverless Instagram endpoint | **Not available.** Wix runs no server-side code, so Bottled Moments is a curated gallery shipped with the page. |
| Own `robots.txt` / `sitemap.xml` | **Overridden.** Wix serves its own at both paths. Crawl directives and the submitted sitemap live in the Wix dashboard, under SEO Tools. |
| Pretty URLs | **Not available.** No directory indexes; every page is addressed as `.html`. |

What Wix gives back is the CMS, the forms, and the dashboard — the reasons it was chosen.

The canonical host is now `https://www.brisabay.com/`, because Wix 301s the apex to `www`.
`tools/check-pages.mjs` asserts that host in every canonical, `og:url`, `og:image` and
sitemap entry, so the assertions and the server agree.

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

## Phase 0 — Move the site to its own domain ✅ done, via Wix

> Findings 1, 2, 3 and 17 shared one root cause: the domain served someone else's
> placeholder. That is resolved — `brisabay.com` serves the site.

What landed, in place of the Cloudflare steps this section used to list:

- **The domain serves the real site.** `https://www.brisabay.com/` is the site; the apex
  301s to `www`; the GoDaddy placeholder is gone.
- **Security headers did *not* land, and cannot.** See the table above. The `<meta>` CSP is
  the whole policy — `tools/csp.json` is its source of truth, and step 0.5 of the old plan
  ("drop the meta CSP") must **not** be carried out; it would leave the site with no policy
  at all.
- **The Instagram endpoint was removed rather than ported.** There is nowhere to run it.
- **Redirects are stub pages**, not 301s, for the two renamed URLs.
- **Release is now a build step:** `node tools/build-wix.mjs --check && npx @wix/cli@latest release`.
  Before this existed, `outputDirectory` was `"."` and the whole repo was public on the
  domain — `server.py`, `README.md`, `AGENTS.md` and the unexecuted Pages function were all
  fetchable.

**Verify**

```bash
curl -sI https://www.brisabay.com/                    # 200, and note: no CSP header — expected
curl -so /dev/null -w '%{http_code}\n' https://www.brisabay.com/server.py   # want 404
```

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
