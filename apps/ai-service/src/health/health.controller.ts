import { Controller, Get } from '@nestjs/common';
import { SkipServiceAuth } from '../common/public.decorator.js';

@Controller('health')
@SkipServiceAuth()
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
