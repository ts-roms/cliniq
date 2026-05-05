import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      '**/.next/**',
      '**/.expo/**',
      '**/generated/**',
      '**/storybook-static/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [
            '^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$',
            '^.*/tailwind\\.preset\\.cjs$',
            '^.*/tailwind\\.config\\.[cm]?js$',
            '^.*/globals\\.css$',
          ],
          depConstraints: [
            // Apps may consume any shared lib but never another app
            { sourceTag: 'scope:web',       onlyDependOnLibsWithTags: ['scope:web', 'scope:shared'] },
            { sourceTag: 'scope:mobile',    onlyDependOnLibsWithTags: ['scope:mobile', 'scope:shared'] },
            { sourceTag: 'scope:api',       onlyDependOnLibsWithTags: ['scope:api', 'scope:shared'] },
            // Anything may consume shared
            { sourceTag: 'scope:shared',    onlyDependOnLibsWithTags: ['scope:shared'] },
            // Type rule — apps cannot depend on apps
            { sourceTag: 'type:app',        onlyDependOnLibsWithTags: ['type:lib'] },
            // Default: allow anything to depend on anything tagged
            { sourceTag: '*',               onlyDependOnLibsWithTags: ['*'] },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    rules: {},
  },
];
