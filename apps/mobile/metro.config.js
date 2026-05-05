const path = require('path');
const { withNxMetro } = require('@nx/expo');
const { getDefaultConfig } = require('@expo/metro-config');
const { mergeConfig } = require('metro-config');
const { withNativeWind } = require('nativewind/metro');

const defaultConfig = getDefaultConfig(__dirname);
const { assetExts, sourceExts } = defaultConfig.resolver;

const workspaceRoot = path.resolve(__dirname, '../..');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Metro walks up to the workspace root and watches everything beneath it.
// Next.js's `.next/` dir churns files mid-watch on Windows -> ENOENT crash.
// Same for other generated/cache trees we never want bundled into the app.
const blockedDirs = [
  path.join(workspaceRoot, 'apps', 'web', '.next'),
  path.join(workspaceRoot, 'apps', 'web', 'out'),
  path.join(workspaceRoot, '.nx'),
  path.join(workspaceRoot, 'dist'),
  path.join(workspaceRoot, 'coverage'),
  path.join(workspaceRoot, '.git'),
];
const blockList = blockedDirs.map(
  (dir) => new RegExp(`^${escapeRe(dir)}(?:[\\\\/].*)?$`)
);

/** @type {import('metro-config').MetroConfig} */
const customConfig = {
  cacheVersion: '@org/mobile',
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
  resolver: {
    assetExts: assetExts.filter((ext) => ext !== 'svg'),
    sourceExts: [...sourceExts, 'cjs', 'mjs', 'svg'],
    blockList,
  },
};

const merged = mergeConfig(defaultConfig, customConfig);
const withNx = withNxMetro(merged, {
  debug: false,
  extensions: [],
  watchFolders: [],
});

// withNxMetro forces `projectRoot` to the workspace root so JS imports across
// libs/* resolve. The side effect is that Expo's relative asset paths in
// `app.json` (e.g. `./assets/images/icon.png`) get resolved from the workspace
// root, where they don't exist. Pin projectRoot back to `apps/mobile`, but
// keep node_modules lookups going through the workspace-root pnpm store so
// monorepo imports still resolve.
withNx.projectRoot = __dirname;
withNx.resolver = {
  ...withNx.resolver,
  nodeModulesPaths: [
    path.join(__dirname, 'node_modules'),
    path.join(workspaceRoot, 'node_modules'),
  ],
};

module.exports = withNativeWind(withNx, {
  input: './src/global.css',
  inlineRem: 16,
});
