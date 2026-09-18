import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}'],
          // Runtime deps of the migrate/api images (`prisma migrate deploy`
          // on pre-deploy) imported only from prisma.config.ts, which lives
          // outside the lib's build entry so the rule cannot see the usage.
          // @prisma/client is imported by the generated client under
          // src/generated (gitignored, so invisible to the rule) and compiled
          // into dist; it must be a real dependency for `pnpm deploy` images.
          ignoredDependencies: ['prisma', 'dotenv', '@prisma/client'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  {
    ignores: ['**/out-tsc'],
  },
];
