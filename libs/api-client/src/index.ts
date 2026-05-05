// Token injection helper.
export {
  configureAuth,
  configureAutoRefresh,
  configureActingAs,
  authHeader,
  type RefreshedTokens,
} from './configure-auth';

// Re-export the generated typed SDK + types.
// Generation runs via `pnpm nx run @org/api-client:generate`.
export * from './generated';
export { client } from './generated/client.gen';
