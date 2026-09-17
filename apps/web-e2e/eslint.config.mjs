import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    ignores: ['playwright-report', 'test-results', 'dist'],
  },
];
