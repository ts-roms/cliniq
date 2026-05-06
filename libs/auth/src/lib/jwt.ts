// Stateless JWT helpers using jose (web-crypto, runs in Node, browser, edge).
// All tokens are HS256 with the JWT_SECRET. Switch to RS256 + JWKS when we add SSO.
//
// Two audiences live in this codebase:
//   - cliniq-app           — tenant-scoped access tokens (clinic users + portal patients)
//   - cliniq-refresh       — tenant-scoped refresh tokens
//   - cliniq-platform      — platform admin access tokens (SaaS operators)
//   - cliniq-platform-refresh — platform admin refresh tokens
// jose's jwtVerify rejects on audience mismatch, so a stolen tenant access
// token can't impersonate a platform admin and vice versa.

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
  // Tenant kind discriminator — copied from Tenant.kind at token issue time.
  // Used by the web client to decide which UI shell (clinic vs. lab) to render.
  // Tenants don't change kind in practice, so JWT staleness on this field
  // isn't an operational concern.
  tk?: 'CLINIC' | 'LAB';
}

export interface PlatformJwtPayload extends JosePayload {
  sub: string;       // PlatformAdmin id
  email: string;
  typ: 'platform';   // sentinel — defense in depth alongside the audience check
}

const ISSUER = 'cliniq';
const AUDIENCE_TENANT = 'cliniq-app';
const AUDIENCE_TENANT_REFRESH = 'cliniq-refresh';
const AUDIENCE_PLATFORM = 'cliniq-platform';
const AUDIENCE_PLATFORM_REFRESH = 'cliniq-platform-refresh';
const DEFAULT_TTL = '15m';

export const JWT_AUDIENCES = {
  TENANT: AUDIENCE_TENANT,
  TENANT_REFRESH: AUDIENCE_TENANT_REFRESH,
  PLATFORM: AUDIENCE_PLATFORM,
  PLATFORM_REFRESH: AUDIENCE_PLATFORM_REFRESH,
} as const;

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
    .setAudience(opts.audience ?? AUDIENCE_TENANT)
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
    audience: opts.audience ?? AUDIENCE_TENANT,
  });
  if (typeof payload.sub !== 'string') throw new Error('jwt: missing sub');
  if (typeof payload['tid'] !== 'string') throw new Error('jwt: missing tid');
  if (typeof payload['role'] !== 'string') throw new Error('jwt: missing role');
  return payload as ClinIqJwtPayload;
}

export async function signPlatformJwt(
  payload: Omit<PlatformJwtPayload, 'iss' | 'aud' | 'iat' | 'exp' | 'typ'>,
  opts: SignOptions,
): Promise<string> {
  return new SignJWT({ ...payload, typ: 'platform' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? AUDIENCE_PLATFORM)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? DEFAULT_TTL)
    .sign(key(opts.secret));
}

export async function verifyPlatformJwt(
  token: string,
  opts: { secret: string; issuer?: string; audience?: string },
): Promise<PlatformJwtPayload> {
  const { payload } = await jwtVerify(token, key(opts.secret), {
    issuer: opts.issuer ?? ISSUER,
    audience: opts.audience ?? AUDIENCE_PLATFORM,
  });
  if (typeof payload.sub !== 'string') throw new Error('jwt: missing sub');
  if (typeof payload['email'] !== 'string') throw new Error('jwt: missing email');
  if (payload['typ'] !== 'platform') throw new Error('jwt: not a platform token');
  return payload as PlatformJwtPayload;
}
