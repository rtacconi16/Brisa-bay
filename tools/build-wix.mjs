#!/usr/bin/env node
// Retired. The site is Astro (`output: 'server'`). `wix.config.json` no longer
// points at a static dist/ allowlist. Shipping this script's output would put
// the old Design Component pages live again.
//
// Use `npm run build` locally, or `npx @wix/cli@latest build` / `npm run release`
// for the Wix host.

console.error('tools/build-wix.mjs is retired. The site is Astro now. Use npm run build / npx @wix/cli@latest build.');
process.exit(1);
