// Re-exported for the api; the matrix itself lives in @org/shared-types.
export {
  Roles,
  Actions,
  can,
  rolesThatCan,
  type Role,
  type Action,
} from '@org/shared-types';

export {
  signJwt,
  verifyJwt,
  signPlatformJwt,
  verifyPlatformJwt,
  JWT_AUDIENCES,
  type ClinIqJwtPayload,
  type PlatformJwtPayload,
  type SignOptions,
} from './lib/jwt.js';

export { hashPassword, verifyPassword } from './lib/password.js';

export { generateTotpSecret, buildOtpAuthUrl, verifyTotp } from './lib/totp.js';

export { generateOpaqueToken, hashToken, secretsEqual } from './lib/tokens.js';
export { parseDurationMs } from './lib/duration.js';
