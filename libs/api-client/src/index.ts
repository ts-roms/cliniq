// Token injection helper.
export {
  configureAuth,
  configureAutoRefresh,
  configureActingAs,
  configureCookies,
  authHeader,
  type RefreshedTokens,
} from './configure-auth';

// Re-export the generated typed SDK + types.
// Generation runs via `pnpm nx run @org/api-client:generate`.
export * from './generated';
export { client } from './generated/client.gen';

// Lower-level client factory: lets consumers (e.g. the web platform module)
// build a SECOND `Client` instance separate from the global singleton above.
// Required when an audience needs its own response interceptors — e.g. routing
// 401s to a different refresh endpoint and a different login page.
//
// Only the runtime functions are re-exported here. The `ClientOptions` type
// already comes through via `export * from './generated'`; re-exporting it
// again would error with "Module has already exported a member named
// 'ClientOptions'" and break the web build.
export { createClient, createConfig } from './generated/client';
