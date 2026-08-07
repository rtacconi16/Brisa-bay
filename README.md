# Brisa Bay

Marketing site for Brisa Bay, a Napa Valley wine label. Seven static pages plus a
store locator that maps ~100 stockists.

Live: GitHub Pages, served from `main`. There is no build step — **what is in the repo
is what ships**.

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

`server.py` does three things a plain file server doesn't:

1. **Sends the security headers** (CSP, `X-Frame-Options`, `Permissions-Policy`, …). See
   [Security headers](#security-headers) — these are local-only today, which matters.
2. **Serves `/api/instagram/moments`**, the homepage's "Bottled Moments" feed.
3. **Applies the CSP that catches inline-script mistakes.** The policy deliberately omits
   `'unsafe-inline'` for scripts, so a classic inline `<script>` is *blocked locally* and
   works fine on GitHub Pages. That asymmetry is intentional: it makes the stricter
   environment the one you develop against. Page JavaScript belongs in an external `.js`
   file (see `blends-motion.js`).

### Instagram feed (optional)

```bash
cp .env.example .env   # then fill in the two required values
```

Without credentials the API returns a curated fallback gallery, which is what production
serves today (see [Known gaps](#known-gaps)). `.env` is gitignored — keep it that way.

Check status: <http://127.0.0.1:8080/api/health>

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

Both exit non-zero on failure, so they work as a build gate. **Run them before every push** —
there is no CI enforcing them yet (see [Known gaps](#known-gaps)). Warnings (missing phone
numbers, coordinate precision) are reported but do not fail the build; they need someone with
the source data, not a code change.

---

## Layout

```
index.html  about.html  blends.html  where-to-buy.html      pages
privacy.html  terms.html  accessibility.html

support.js            the DC runtime — renders every page (read the header comment)
resources.js          points the runtime at vendored React instead of a CDN
age-gate.js           shared age verification: persistence, focus trap, scroll lock

store-map.js          <store-map> Leaflet custom element
locator-config.js     every external-service dependency, in one place
locator-util.js       distance maths, directions URLs, tel: links
locator-analytics.js  provider-agnostic instrumentation (inert by default)
locator-jsonld.js     schema.org markup for the locator
stores.json           102 stockists — the locator's data

blends-motion.js      carousel motion for blends.html
server.py             dev server + Instagram API + security headers
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
**Bump it in every page that references the file whenever you change that file.** There is no
build step to do this for you, and GitHub Pages caches for 10 minutes.

### Shared code

There is no include mechanism. The site header, the footer and the ~45-line CSS preamble are
duplicated in all 7 pages, and the FAQ list in 4. A change to any of them means editing every
copy — roughly one commit in six in this repo's history has done exactly that, and drift has
crept in more than once. Verify with `grep -l` that you got them all.

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
on `about.html` and the hero on `blends.html`. Images that fill a fixed-size CSS box with
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

`server.py` sends a CSP plus `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`
and `Permissions-Policy`.

**GitHub Pages sends no response headers**, so every page also carries the same policy as a
`<meta http-equiv="Content-Security-Policy">` tag. That is what actually protects production —
keep the two in sync when either changes.

What meta *cannot* express is `frame-ancestors`, and `X-Frame-Options` is header-only, so
**clickjacking protection is still missing in production.** Closing that needs a CDN that can
set headers (Cloudflare's free tier, Netlify) in front of Pages; the same move would let the
other three headers through and unblock a serverless Instagram endpoint.

The CSP needs `'unsafe-eval'` because the DC runtime compiles component logic with
`new Function`, and `'unsafe-inline'` for styles because the pages use inline `style`
attributes throughout. Neither is a preference; both are what the framework requires.

---

## Known gaps

Deliberate, known, and written down so they aren't rediscovered as surprises. Full analysis and
a phased plan live in the tech-debt audit.

**Nothing runs the tests automatically.** A GitHub Actions workflow is written and verified —
it runs both tools, syntax-checks every page script and byte-compiles `server.py` — but it is
not in the repository yet. Pushing a file under `.github/workflows/` requires the `workflow`
OAuth scope, which the login used to create these branches does not have. To enable it:

```bash
gh auth refresh -s workflow
```

then push the branch holding the workflow. Until that happens, running the two tools by hand
before pushing is the only thing standing between a regression and `main`.

**`support.js` has no source.** It was bundled from `dc-runtime/src/*.ts`, a tree that is not
in this repo and not anywhere in its git history — the file was committed once, whole, and
never changed. It cannot be regenerated. It *can* be edited: the bundle is unminified with its
module boundaries intact. Read the header comment in the file before touching it.

**Map and geocoding are not production-licensed.** `locator-config.js` points at OpenStreetMap's
tile servers and Komoot's public Photon instance. Both are donated infrastructure with fair-use
terms that do not cover commercial use. Before any real traffic, move to a contracted provider —
the config is structured so it's a two-value change.

**The Instagram feed doesn't run in production.** The homepage fetches `/api/instagram/moments`,
which only `server.py` serves. On Pages that 404s, is caught, and the curated fallback gallery
shows instead — permanently. Either serve it at build time or drop the endpoint deliberately.

**No responsive images.** Every image ships one size to every device — there is no `srcset` and
no per-breakpoint variant, so a phone downloads the same file a desktop does. Same for the hero
video: `<source media="…">` is not reliably honoured inside `<video>`, so a smaller mobile cut
would need a JS source swap. Page weight is now low enough that this is an optimisation rather
than a problem, but it is the next thing worth doing.

**`stores.json` has no phone or website data.** Both fields are threaded through the list rows,
map popups and `tel:` links, and are populated on 0 of 102 records. The code is ready; the data
isn't. Both test tools warn about this on every run.

---

## Deploying

Push to `main`. GitHub Pages serves the repo root as-is.

Before pushing: run both test tools, bump the `?v=` on anything you changed, and check the page
in a browser through `server.py` rather than `file://`.
