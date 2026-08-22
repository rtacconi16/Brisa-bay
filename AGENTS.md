# Brisa Bay

A Wix headless site built with the `wix-headless` skill. Napa Valley wine label — Chardonnay and Sauvignon Blanc, with a stockist locator and no direct shipping.

## Live site
- **Site:** https://www.brisabay.com
- **Dashboard:** https://manage.wix.com/dashboard/f81bd804-9f61-4ed0-a239-a87bd5f499a0

## Frontend
Astro (`output: 'server'`) on the existing Wix site (`siteId` / `appId` in `wix.config.json`). Pretty URLs — `/about`, not `/about.html`. `.html` paths 301.

Local: `npm install && cp .env.example .env && npm run dev`. Build + publish: `npm run release` (do not release until the Astro migration has been reviewed).

## Features
- CMS → Stockists collection powering the store locator (client SDK, with `/stores.json` fallback)
- Forms → Trade & Press Inquiry contact form (not yet on any page; adding it means widening `connect-src` and `form-action` in `tools/csp.json`, which is currently `'none'`)

## Pages
- `/` Home
- `/about` About
- `/ourWines` Wines (`/wines` and `/wines.html` redirect here)
- `/findBrisaBay` Store locator (`/where-to-buy` and `/where-to-buy.html` redirect here)
- `/privacy` Privacy
- `/terms` Terms
- `/accessibility` Accessibility
- `/stockists/*` city and state SEO pages

## Seeded content
102 stockists in 1 CMS collection · 1 contact form.

## Extending
Built with the `wix-headless` skill; re-run it to add features or restyle. Stay on this siteId — do not `create headless` or `headless link`.
