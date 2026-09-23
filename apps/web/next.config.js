//@ts-check

const path = require('node:path');
const { PHASE_PRODUCTION_SERVER } = require('next/constants');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  nx: {},
  // Compile workspace libs from source so 'use client' directives at the
  // component level are preserved and the .js → .ts extension trick works
  // under nodenext / ESM.
  transpilePackages: ['@org/ui', '@org/api-client', '@org/auth'],

  // Docker builds only (apps/web/Dockerfile sets NEXT_OUTPUT_STANDALONE=1):
  // emit .next/standalone, a self-contained server with just the traced
  // files it needs, so the image ships that instead of the whole workspace
  // node_modules. outputFileTracingRoot points at the monorepo root so the
  // workspace libs and hoisted packages are traced. Off elsewhere because
  // `next start` (local, web-e2e in CI) is not meant for standalone output.
  ...(process.env.NEXT_OUTPUT_STANDALONE === '1'
    ? {
        output: 'standalone',
        outputFileTracingRoot: path.join(__dirname, '../../'),
      }
    : {}),

  // Workspace libs use ESM-style `from './foo.js'` imports that point at .ts
  // sources (the nodenext convention). Tell Turbopack to fall back to .ts.
  turbopack: {
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'],
  },

  /**
   * Proxy `/api/*` to the api service from the web's OWN origin.
   *
   * The api sets httpOnly session cookies with no Domain attribute, so they
   * are host-only to whoever answered the login. With the browser calling the
   * api on its own hostname, the cookie lands there — and apps/web/proxy.ts,
   * which gates the protected routes, only sees cookies sent to the WEB host.
   * It finds none and redirects straight back to /login. Routing the calls
   * through here puts the cookie where the guard can read it, and drops the
   * need for SameSite=None.
   *
   * `afterFiles`: the app's own routes (apps/web/app/api/*) still win, and
   * anything unmatched falls through to the api.
   *
   * Only active when API_PROXY_TARGET is set, so a plain `next dev` against a
   * directly-addressable api is unaffected.
   */
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    if (!target) return [];
    return {
      beforeFiles: [],
      afterFiles: [
        { source: '/api/:path*', destination: `${target}/api/:path*` },
      ],
      fallback: [],
    };
  },

  webpack(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

/**
 * `next start` re-reads this file at runtime. The production images ship a
 * prod-only node_modules (see apps/web/Dockerfile), so `@nx/next` — a
 * devDependency that drags the whole nx toolchain along — must only be
 * required for build/dev phases. This mirrors what `withNx` itself returns
 * for the production-server phase: the plain config with `nx` stripped.
 *
 * @param {string} phase
 * @param {unknown} ctx
 */
module.exports = async (phase, ctx) => {
  if (phase === PHASE_PRODUCTION_SERVER) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { nx, ...runtimeConfig } = nextConfig;
    return { distDir: '.next', ...runtimeConfig };
  }
  const { composePlugins, withNx } = require('@nx/next');
  return composePlugins(withNx)(nextConfig)(phase, ctx);
};
