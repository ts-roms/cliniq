import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '@org/db';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let db: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      uptime: process.uptime(),
      checks: { db },
      timestamp: new Date().toISOString(),
    };
  }
}
