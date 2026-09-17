/* eslint-disable */
const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: '@org/auth',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  // `jose` ships ESM only; let swc turn it into CJS for the test runtime.
  // The lookahead skips every node_modules path except ones under jose
  // (pnpm layout: node_modules/.pnpm/jose@x/node_modules/jose/...).
  transformIgnorePatterns: ['/node_modules/(?!.*jose)'],
  coverageDirectory: 'test-output/jest/coverage',
};
