// Password hashing — bcryptjs so it runs in any JS runtime (no native build).
// Cost factor 12 = ~250ms on a modern CPU; bump as hardware improves.

import bcrypt from 'bcryptjs';

const COST = 12;

export async function hashPassword(plaintext: string): Promise<string> {
  if (plaintext.length < 8) throw new Error('password too short');
  return bcrypt.hash(plaintext, COST);
}

export async function verifyPassword(plaintext: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plaintext, hash);
}
