import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

declare global {

  var __prisma: PrismaClient | undefined;
}

function buildClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env['DATABASE_URL'] ?? '',
  });
  return new PrismaClient({
    adapter,
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });
}

export const prisma: PrismaClient = globalThis.__prisma ?? buildClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalThis.__prisma = prisma;
}

export * from '../generated/prisma/client.js';
export * from '../generated/prisma/models.js';
export * from '../generated/prisma/enums.js';
