# Brisa Bay

Marketing site for Brisa Bay, a Napa Valley wine label. Seven static pages plus a
store locator that maps ~100 stockists.

Live: **Wix**, released with the Wix CLI from `dist/`. Pages are addressed by their
`.html` path — `/findBrisaBay.html`, not `/findBrisaBay` — because Wix serves uploaded
files verbatim and has no directory indexes.

---

## Run it locally

```bash
python3 server.py
```

Then open <http://127.0.0.1:8080>. Python 3.9+; no dependencies.

You can open the `.html` files directly over `file://`, but don't — the locator fetches
`stores.json` and the age gate uses `localStorage`, and both behave differently without an
origin. Always test through the server.

### Why a server at all

`server.py` exists to imitate Wix, so that what works locally works after a release:

1. **It serves `.html` paths and nothing else.** No directory indexes, no rewrites, no
   pretty URLs — request `/about` locally and you get the 404 page, exactly as you would
   in production. A link that works here works there.
2. **It sends the CSP from `tools/csp.json`**, the same policy each page carries as a
   `<meta>` tag, plus the directives a meta tag cannot express. The policy deliberately
   omits `'unsafe-inline'` for scripts, so a classic inline `<script>` is blocked while
   you are developing rather than after you ship. Page JavaScript belongs in an external
   `.js` file (see `wines-motion.js`, `redirect.js`).
3. **It runs no server-side code**, because Wix runs none. If a feature needs an endpoint,
   it cannot be built this way — see [What Wix takes over](#what-wix-takes-over).

---

## Deploying

```bash
node tools/build-wix.mjs --check
npx @wix/cli@latest release
```

The build assembles `dist/`, which is the directory `wix.config.json` points the CLI at
and the only thing that ships. **This is a real build step now, and skipping it releases
a stale `dist/`.**

`dist/` is built by an explicit allowlist in `tools/build-wix.mjs`, not by copying the
repo. That is deliberate: `outputDirectory` used to be `"."`, and everything in the repo
was live and fetchable on the domain — `/server.py`, `/README.md`, `/AGENTS.md`,
`/_headers`, and the Pages function under `/functions`, which Wix served as readable text
rather than executing. Adding a page or an asset directory means adding it to `SITE` in
that file; anything not named there does not ship.

`--check` fails the build if `dist/` contains something unshippable, if a page has lost
its CSP tag, if a page links an extensionless URL, or if a page calls an `/api/` route.
CI runs it on every push.

**Then verify the release from outside:**

```bash
node tools/verify-live.mjs
```

Everything else in `tools/` checks the repo. This is the only thing that checks what
visitors actually get, and the two have been out of step before: one release shipped the
renamed pages together with apex canonicals, no CSP, and the entire repo as public files,
and nothing noticed because nothing was looking at production. It exits non-zero on
failure, so it can gate a deploy script. It is not in CI — CI has no site to look at.

### URL shape

Pages are addressed as `.html` — `/findBrisaBay.html`, not `/findBrisaBay`. Whether that is
*necessary* is an open question, and the answer is worth having before the renamed URLs get
indexed.

Wix documents none of this, and the obvious test is misleading: `/about` returns 404 today,
but so does `/about/index.html`, because no such directory has ever been released. What is
known is that Wix 301s `/about/` to `/about`, stripping the trailing slash even when nothing
is deployed at either path — which is how a host behaves when it *does* resolve directory
indexes.

`dist/urlcheck/index.html` settles it. After the next release:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://www.brisabay.com/urlcheck
```

- **200** — directory indexes work. Clean URLs are available; see below.
- **404** — they do not. `.html` is required, and the question is closed.

The probe is noindex, linked from nowhere, and about a kilobyte. Delete `tools/urlcheck/`
and the `PROBE` entry in `tools/build-wix.mjs` once it has answered.

**If the answer is 200**, switching costs one focused change: emit each page as
`<name>/index.html` in `tools/build-wix.mjs` instead of `<name>.html`, drop the suffix from
every internal link, canonical, `og:url` and sitemap entry, keep the current `.html` files as
redirect stubs so existing links survive, and invert the "links no extensionless URLs" checks
in `tools/check-pages.mjs` and the build. The source tree does not have to change shape — the
build can do the renaming, which keeps one file per page in the repo.

### What Wix takes over

Three things are not ours to control from this repo, and all three were found the hard way:

| Path / concern | What actually happens |
| --- | --- |
| `robots.txt`, `sitemap.xml` | **Wix serves its own.** Ask for `/sitemap.xml` and you get a Wix-generated page, not our file. Both files stay in the repo as the canonical URL inventory (`tools/check-pages.mjs` validates every entry), but they are not uploaded — configure crawling and the submitted sitemap in the Wix dashboard, under SEO Tools. |
| Response headers | Wix sends `nosniff` and its own HSTS, and offers no way to add others. There is no `_headers` equivalent. This is why the CSP is a meta tag. |
| Redirects | No 301s for uploaded files. `where-to-buy.html` and `wines.html` are stub pages that redirect to their new names — the only mechanism available. |
| The 404 page | **Wix serves its own.** Ask for a path that does not exist and you get Wix's "Page wasn't found", never our `404.html`. The file still ships because `server.py` uses it locally and it costs nothing, but production never shows it — restyle the 404 in the Wix dashboard, not here. |

Canonical host is `https://www.brisabay.com/`: Wix 301s the apex to `www`, and every
canonical, `og:url` and sitemap entry matches that. Changing it means changing the primary
domain in the Wix dashboard *and* the URLs in this repo, together.

---

---

## Tests

```bash
node tools/test-locator.mjs
```

235 assertions covering the locator's search ranking, distance maths, geocode filtering and
store-data integrity. Add `--live` to also exercise the real geocoder — don't do that in a
loop, it calls a donated public service.

```bash
node tools/validate-stores.mjs
```

Validates all 102 records in `stores.json`. Run it after any stockist edit.

```bash
node tools/test-age-gate.mjs
```

44 assertions over `age-gate.js` — persistence, keyboard activation, the focus trap, the scroll
lock's save/restore, and the `inert` fallback for Safari before 15.5. It runs against a small
hand-written DOM stub rather than jsdom, which keeps the repo dependency-free and lets the
Safari path be exercised directly by pretending `inert` is unsupported.

```bash
node tools/check-pages.mjs
```

98 static checks across the seven pages. The important one is that each page's
`<script type="text/x-dc">` logic block **parses** — the browser never parses it, the runtime
compiles it with `new Function` at mount time, so a syntax error there is silent: the component
simply never mounts and you get raw template. A missing comma in `renderVals` took out three
pages during the copyright change and the only visible symptom was a `mailto:` link with no
address. Also checks that every `{{ value }}` has a source, that the shared stylesheet and data
module are wired up in the right order, that nothing has re-hardcoded the contact address or
copyright year, and the accessibility basics (one `<h1>`, a skip link, `alt` on every image).

```bash
python3 tools/test-server.py
```

23 tests over `server.py`: caption truncation, media normalisation for video and carousel posts,
the fallback path that production actually serves, cache behaviour, and `.env` parsing. It also
**checks the CSP in `server.py` against the `<meta>` copy in every page** — the same policy is
written twice, so this fails if they drift.

All five exit non-zero on failure, so they work as a build gate. **Run them before every push** —
there is no CI enforcing them yet (see [Known gaps](#known-gaps)). Warnings (missing phone
numbers, coordinate precision) are reported but do not fail the build; they need someone with
the source data, not a code change.

---

## Layout

```
index.html  about.html  ourWines.html  findBrisaBay.html      pages
privacy.html  terms.html  accessibility.html  404.html

where-to-buy.html  wines.html   redirect stubs for the pre-Wix URLs
redirect.js                     the stubs' redirect, external because of the CSP

site.css              styles shared by every page, and the --bb-* palette
site-data.js          FAQ list, contact address, copyright — shared content

support.js            the DC runtime — renders every page (read the header comment)
resources.js          points the runtime at vendored React instead of a CDN
age-gate.js           shared age verification: persistence, focus trap, scroll lock

store-map.js          <store-map> Leaflet custom element
locator-config.js     every external-service dependency, in one place
locator-util.js       distance maths, directions URLs, tel: links
locator-search.js     search ranking and geocode filtering (pure; the tests load it)
locator-analytics.js  provider-agnostic instrumentation (inert by default)
locator-jsonld.js     schema.org markup for the locator
stores.json           102 stockists — the locator's data

wines-motion.js      carousel motion for ourWines.html
server.py             dev server — imitates Wix, sends the CSP
tools/build-wix.mjs   assembles dist/, the only thing that ships
tools/csp.json        the CSP, shared by server.py, the checks and every page
tools/                tests, data validation, dependency vendoring
assets/web2/          the live image set (see the note in Known gaps)
```

### How a page works

Each page is a standalone HTML file containing an `<x-dc>` template and a
`<script type="text/x-dc">` block defining `class Component extends DCLogic`. `support.js`
parses the template, compiles the logic block and mounts it with React. `{{ expr }}` in the
template interpolates from the object returned by `renderVals()`.

Load order in `<head>` matters: `resources.js` **must** come before `support.js`, or the
vendored-React override is read too late.

---

## Conventions

### Cache busting

Local scripts carry a manual version string — `age-gate.js?v=2`, `store-map.js?v=15`.
**Bump it in every page that references the file whenever you change that file.** The build
copies files, it does not rewrite them, so nothing does this for you — and Wix serves
uploaded assets with a one-hour `immutable` cache, so a missed bump is an hour of stale JS.

### Shared code

There is still no include mechanism for **markup**, so the site header and footer are written
out in each page. What used to be duplicated alongside them is not any more:

| what | where it lives now |
|------|--------------------|
| fonts, bold reset, header/nav, links, skip link | `site.css` |
| the brand palette (`--bb-*`) | `site.css` |
| the FAQ list | `site-data.js` |
| the contact address | `site-data.js` |
| the copyright year | `site-data.js`, derived from the clock |

`node tools/check-pages.mjs` fails if a page starts re-declaring any of them.

The header and footer markup is deliberately **not** shared. The content is the same everywhere,
but each page tunes its own layout — different `z-index`, `padding`, `gap` and `flex` behaviour,
because the footer sits inside a scroll-pinned section on one page and a flex column on another.
Sharing it needs either a build step or a runtime component with roughly six layout parameters,
and the payoff is thin: the link list has changed once in this repo's history. Revisit it if that
stops being true.

When you do edit the header or footer, `grep -l` to check you got all seven.

### Vendored dependencies

React, Leaflet and markercluster are served from `assets/vendor/` rather than a CDN, so
ad blockers, corporate proxies and CDN outages can't blank the site.

```bash
./tools/vendor.sh
```

Re-downloads and verifies every file against a pinned SHA-384. To upgrade: bump the version in
the script, run it, expect a FAIL, verify the new bytes deliberately, then paste in the
reported hash. Current: React 18.3.1, Leaflet 1.9.4, markercluster 1.5.3.

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
paint, which is the opposite of what lazy loading is for. Today that exception is the band image
on `about.html` and the hero on `wines.html`. Images that fill a fixed-size CSS box with
`object-fit: cover` (the Bottled Moments tiles) don't need dimensions — the box already
reserves the space.

**The hero video** is H.264, 24fps, no audio track, `+faststart` so playback begins before the
download finishes:

```bash
ffmpeg -i master.mp4 -an -r 24 -c:v libx264 -crf 32 -preset slow \
       -profile:v high -pix_fmt yuv420p -movflags +faststart -g 48 assets/web2/hero-video.mp4
```

Regenerate `hero-poster.jpg` alongside it (`-frames:v 1` at `-ss 0`) — it is what paints while
the video streams in. VP9/WebM was measured on this footage and came out *larger* than H.264,
so there is deliberately no WebM source; re-measure before assuming otherwise for new footage.

The 29MB master is not in the working tree. It is in git history — `git show d78d287:assets/web2/hero-video.mp4`
— so re-encode from there rather than from the shipped file, which would compound generation loss.

---

## Security headers

**Wix sends no security headers and provides no way to add them** — there is no `_headers`
file, no header setting in the dashboard. So the `<meta http-equiv="Content-Security-Policy">`
tag in each page is not defence in depth. It is the entire policy production enforces.

`tools/csp.json` is the single source of truth. `server.py` reads it and sends the real
header locally; `tools/check-pages.mjs` asserts that every page carries exactly the policy
assigned to it; `tools/build-wix.mjs --check` refuses to ship a page that has lost the tag.
Change the policy there, then re-run the checks — never edit the tag in a page by hand.

Two policies exist. Everything gets `base`, which reaches nothing off-origin. Only
`findBrisaBay.html` gets `locator`, which additionally allows the basemap tiles, the
geocoder, and the Wix SDK and Data API the Stockists collection is read through. A page
widens its policy by being named in `csp.json`, not by accident.

**What production does not get, and cannot:**

- **`frame-ancestors` is ignored in a meta tag**, and `X-Frame-Options` is header-only.
  **The site is framable and clickjacking is not mitigated.** There is no fix available
  from inside this repo — it needs a host that can set response headers.
- `Referrer-Policy` and `Permissions-Policy` are header-only too, so the geolocation
  restriction the locator relies on is local-only.

`server.py` sends all of these so local development is never *less* strict than production.
That asymmetry is the point; it is not a claim about what visitors get.

The CSP needs `'unsafe-eval'` because the DC runtime compiles component logic with
`new Function`, and `'unsafe-inline'` for styles because the pages use inline `style`
attributes throughout. Neither is a preference; both are what the framework requires.

**Open item — `esm.sh` in `script-src`.** `findBrisaBay.html` imports `@wix/sdk` and
`@wix/data` from `esm.sh` at runtime, so the locator policy has to allow executable code
from a third-party CDN, at an unpinned major version. That is the one origin in either
policy that is not strictly necessary: vendoring both modules into `assets/vendor/` the way
Leaflet already is would return `script-src` to `'self'`. Worth doing before real traffic.

---

## Known gaps

Deliberate, known, and written down so they aren't rediscovered as surprises. Full analysis and
a phased plan live in the tech-debt audit.

**`support.js` has no source.** It was bundled from `dc-runtime/src/*.ts`, a tree that is not
in this repo and not anywhere in its git history — the file was committed once, whole, and
never changed. It cannot be regenerated. It *can* be edited: the bundle is unminified with its
module boundaries intact. Read the header comment in the file before touching it.

**Map and geocoding are not production-licensed.** `locator-config.js` points at OpenStreetMap's
tile servers and Komoot's public Photon instance. Both are donated infrastructure with fair-use
terms that do not cover commercial use. Before any real traffic, move to a contracted provider —
the config is structured so it's a two-value change.

**Bottled Moments is curated, not live.** Wix runs no server-side code, so there is nowhere
to call the Instagram Graph API from and nowhere to hold a token. The gallery ships with the
page (`curatedMoments` in `index.html`). Making it live again means a service outside this
repo that writes the images into the page at build time.

**No responsive images.** Every image ships one size to every device — there is no `srcset` and
no per-breakpoint variant, so a phone downloads the same file a desktop does. Same for the hero
video: `<source media="…">` is not reliably honoured inside `<video>`, so a smaller mobile cut
would need a JS source swap. Page weight is now low enough that this is an optimisation rather
than a problem, but it is the next thing worth doing.

**`stores.json` has no phone or website data.** Both fields are threaded through the list rows,
map popups and `tel:` links, and are populated on 0 of 102 records. The code is ready; the data
isn't. Both test tools warn about this on every run.

---

## Before you push

Run `node tools/check-pages.mjs`, the other tools, and `node tools/build-wix.mjs --check`
(CI runs all of them). Bump the `?v=` on anything you changed, and check the page in a
browser through `server.py` rather than `file://`.
