export {
  Roles,
  Actions,
  can,
  rolesThatCan,
  type Role,
  type Action,
} from './lib/roles.js';

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

export {
  generateTotpSecret,
  buildOtpAuthUrl,
  verifyTotp,
} from './lib/totp.js';
