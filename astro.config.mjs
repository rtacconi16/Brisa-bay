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

// `wix build` is just `astro build` with no WIX_CI/WIX_BUILD. Default to the
// cloud adapter so production does not 500. Local `npm run dev` / `preview` /
// `build` keep the Node adapter (lifecycle event, argv, or BB_NODE_ADAPTER=1).
const proc = (/** @type {any} */ (globalThis)).process || {};
const env = proc.env || {};
const life = env.npm_lifecycle_event || '';
const astroCmd = Array.isArray(proc.argv) ? String(proc.argv[2] || '') : '';
const useNodeAdapter = env.BB_NODE_ADAPTER === '1'
  || life === 'dev'
  || life === 'preview'
  || life === 'build'
  || astroCmd === 'dev'
  || astroCmd === 'preview';

// Production Wix BaaS looks for /user-code/entry.mjs (Kubernetes). The fetch
// adapter defaults to Cloudflare unless this is set, which 500s the live site.
if (!useNodeAdapter && !env.WIX_CLOUD_PROVIDER) {
  env.WIX_CLOUD_PROVIDER = 'KUBERNETES';
}

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
  adapter: useNodeAdapter
    ? node({ mode: 'standalone' })
    : cloudProviderFetchAdapter({}),
  trailingSlash: 'never',
  image: {
    domains: ['static.wixstatic.com']
  }
});
