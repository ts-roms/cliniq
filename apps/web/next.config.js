//@ts-check

const { composePlugins, withNx } = require('@nx/next');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  nx: {},
  // Compile workspace libs from source so 'use client' directives at the
  // component level are preserved and the .js → .ts extension trick works
  // under nodenext / ESM.
  transpilePackages: ['@org/ui', '@org/api-client', '@org/auth'],

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

const plugins = [withNx];

module.exports = composePlugins(...plugins)(nextConfig);
