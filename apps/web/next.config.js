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
