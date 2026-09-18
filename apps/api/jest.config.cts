/* eslint-disable */
const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: '@org/api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\.[tj]s$': ['@swc/jest', swcJestConfig],
    // Prisma 7's client engine loads its WASM query compiler via
    // `await import('@prisma/client/runtime/*.mjs')`. Under Jest's CJS
    // runtime that becomes a require() of an ESM file, so let swc transform
    // those .mjs files too (everything else in node_modules stays ignored).
    '^.+\.mjs$': ['@swc/jest', swcJestConfig],
  },
  transformIgnorePatterns: [
    '[\\/]node_modules[\\/](?!.*@prisma[\\/]client[\\/]runtime[\\/])',
  ],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
