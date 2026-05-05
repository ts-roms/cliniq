// Stateless JWT helpers using jose (web-crypto, runs in Node, browser, edge).
// All tokens are HS256 with the JWT_SECRET. Switch to RS256 + JWKS when we add SSO.

import { SignJWT, jwtVerify, type JWTPayload as JosePayload } from 'jose';
import type { Role } from './roles.js';

export interface ClinIqJwtPayload extends JosePayload {
  sub: string;        // user id
  tid: string;        // tenant id
  role: Role;
  email?: string;
  // For role=PATIENT only — id of the Patient record this account represents.
  // Self-scoped controllers (/api/me/*) trust this and ignore client-supplied
  // patientId, so a portal user cannot access another patient's data.
  pid?: string;
}

const ISSUER = 'cliniq';
const AUDIENCE = 'cliniq-app';
const DEFAULT_TTL = '15m';

function key(secret: string): Uint8Array {
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  return new TextEncoder().encode(secret);
}

export interface SignOptions {
  secret: string;
  expiresIn?: string;
  issuer?: string;
  audience?: string;
}

export async function signJwt(
  payload: Omit<ClinIqJwtPayload, 'iss' | 'aud' | 'iat' | 'exp'>,
  opts: SignOptions
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? DEFAULT_TTL)
    .sign(key(opts.secret));
}

export async function verifyJwt(
  token: string,
  opts: { secret: string; issuer?: string; audience?: string }
): Promise<ClinIqJwtPayload> {
  const { payload } = await jwtVerify(token, key(opts.secret), {
    issuer: opts.issuer ?? ISSUER,
    audience: opts.audience ?? AUDIENCE,
  });
  if (typeof payload.sub !== 'string') throw new Error('jwt: missing sub');
  if (typeof payload['tid'] !== 'string') throw new Error('jwt: missing tid');
  if (typeof payload['role'] !== 'string') throw new Error('jwt: missing role');
  return payload as ClinIqJwtPayload;
}
