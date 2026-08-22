// @ts-check
import { defineConfig, envField } from 'astro/config';
import wix from '@wix/astro';
import wixPages from '@wix/astro-pages';
import node from '@astrojs/node';
import cloudProviderFetchAdapter from '@wix/cloud-provider-fetch-adapter';
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

// Wix CLI sets WIX_CI / WIX_BUILD. Local `astro build` and `astro preview`
// must keep the Node adapter — using the cloud adapter locally produces a
// bundle that cannot be previewed, and using it whenever NODE_ENV=production
// would also break `astro build` on a laptop.
const env = (/** @type {any} */ (globalThis)).process?.env || {};
const isWixBuild = Boolean(env.WIX_CI || env.WIX_BUILD);

const wixEnvSchema = {
  WIX_CLIENT_ID: envField.string({ access: 'public', context: 'client', optional: true }),
  WIX_CLIENT_INSTANCE_ID: envField.string({ access: 'secret', context: 'server', optional: true }),
  WIX_CLIENT_PUBLIC_KEY: envField.string({ access: 'secret', context: 'server', optional: true }),
  WIX_CLIENT_SECRET: envField.string({ access: 'secret', context: 'server', optional: true })
};

/** Copy assets into public/ on every Astro run, including `wix build`. */
function brisaPrep() {
  return {
    name: 'brisa-prep',
    hooks: {
      'astro:config:setup': () => {
        spawnSync((/** @type {any} */ (globalThis)).process.execPath, [join(root, 'tools/copy-public.mjs')], {
          stdio: 'inherit',
          cwd: root
        });
      },
      'astro:build:start': () => {
        const dist = join(root, 'dist');
        if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });
      }
    }
  };
}

/** @wix/astro marks instance secrets required; local Node preview has none. */
function relaxWixEnv() {
  return {
    name: 'brisa-relax-wix-env',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          env: {
            validateSecrets: false,
            schema: wixEnvSchema
          }
        });
      }
    }
  };
}

export default defineConfig({
  site: 'https://www.brisabay.com',
  env: {
    validateSecrets: false,
    schema: wixEnvSchema
  },
  integrations: [brisaPrep(), wix(), wixPages(), relaxWixEnv()],
  security: { checkOrigin: false },
  output: 'server',
  adapter: isWixBuild
    ? cloudProviderFetchAdapter({})
    : node({ mode: 'standalone' }),
  trailingSlash: 'never',
  image: {
    domains: ['static.wixstatic.com']
  }
});
