const nextJest = require('next/jest.js');

const createJestConfig = nextJest({
  dir: './',
});

const config = {
  displayName: '@org/web',
  preset: '../../jest.preset.js',
  transform: {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nx/react/plugins/jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/apps/web',
  testEnvironment: 'jsdom',
  // Mirrors the `paths` block in apps/web/tsconfig.json. nextJest() wires
  // these up automatically when invoked from a clean Next.js project, but
  // this workspace nests it under Nx + a workspace preset, and the
  // resolvedBaseUrl override below would strip path-alias support too.
  // Defining them explicitly keeps test resolution aligned with TS.
  moduleNameMapper: {
    '^@/features/(.*)$': '<rootDir>/features/$1',
    '^@/shared/(.*)$': '<rootDir>/shared/$1',
    '^@/(.*)$': '<rootDir>/$1',
  },
};

const jestConfig = createJestConfig(config);

module.exports = async () => {
  const resolved = await jestConfig();
  // Disable SWC path alias resolution — handled by Nx jest resolver.
  for (const value of Object.values(resolved.transform)) {
    if (Array.isArray(value) && value[1]?.resolvedBaseUrl) {
      value[1] = { ...value[1], resolvedBaseUrl: undefined };
    }
  }
  return resolved;
};
