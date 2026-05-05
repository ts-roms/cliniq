import { defineConfig } from '@hey-api/openapi-ts';

// Generates a typed TS client from apps/api/openapi.json into src/generated/.
// Re-run after updating the api: `pnpm nx run @org/api-client:generate`
export default defineConfig({
  input: '../../apps/api/openapi.json',
  output: {
    path: 'src/generated',
    postProcess: ['prettier'],
    clean: true,
  },
  plugins: [
    '@hey-api/typescript',
    '@hey-api/sdk',
    '@hey-api/client-fetch',
  ],
});
