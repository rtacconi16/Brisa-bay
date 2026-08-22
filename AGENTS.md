# Brisa Bay

A Wix headless site built with the `wix-headless` skill. Napa Valley wine label — Chardonnay and Sauvignon Blanc, with a stockist locator and no direct shipping.

## Live site
- **Site:** https://export-8e9ef224-info699110.wix-site-host.com
- **Dashboard:** https://manage.wix.com/dashboard/f81bd804-9f61-4ed0-a239-a87bd5f499a0

## Frontend
custom. Run: `python3 server.py`. Build + publish: `node tools/build-wix.mjs --check && npx @wix/cli@latest release`.

The build assembles `dist/`, which is what `wix.config.json` uploads. It is an allowlist,
not a copy of the repo — see README.md, "Deploying". Releasing without building ships a
stale `dist/`.

## Features
- CMS → Stockists collection powering the store locator
- Forms → Trade & Press Inquiry contact form (not yet on any page; adding it means widening
  `connect-src` and `form-action` in `tools/csp.json`, which is currently `'none'`)

## Pages
- `/` Home
- `/about.html` About
- `/ourWines.html` Wines (`/wines.html` redirects here)
- `/findBrisaBay.html` Store locator (`/where-to-buy.html` redirects here)
- `/privacy.html` Privacy
- `/terms.html` Terms
- `/accessibility.html` Accessibility
- `/stockists/*` city and state SEO pages

## Seeded content
102 stockists in 1 CMS collection · 1 contact form.

## Extending
Built with the `wix-headless` skill; re-run it to add features or restyle.
