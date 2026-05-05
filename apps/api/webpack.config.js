const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const nodeExternals = require('webpack-node-externals');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  target: 'node22',
  // Leave node_modules + workspace libs as require() calls. This avoids the
  // "Class constructor t cannot be invoked without 'new'" error you get when
  // SWC downlevels a child class while the parent (PrismaClient) was loaded
  // through webpack's module wrapper. Workspace libs are linked via pnpm so
  // the runtime resolves them just fine.
  externalsPresets: { node: true },
  externals: [
    nodeExternals({
      allowlist: [],
    }),
    nodeExternals({
      modulesDir: join(__dirname, '../../node_modules'),
      allowlist: [],
    }),
  ],
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'swc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: true,
    }),
  ],
};
