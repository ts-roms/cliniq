import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PlatformAuthController } from './platform-auth.controller.js';
import { PlatformAuthService } from './platform-auth.service.js';
import { PlatformTenantsController } from './platform-tenants.controller.js';
import { PlatformTenantsService } from './platform-tenants.service.js';
import { PlatformAuthGuard } from './guards/platform-auth.guard.js';

/**
 * Platform admin surface — a separate identity (PlatformAdmin), separate auth
 * (cliniq-platform JWT audience), and separate guard (PlatformAuthGuard).
 *
 * Tenant guards (JwtAuthGuard, RbacGuard, FeatureGuard) all skip routes
 * marked @PlatformAuth. PlatformAuthGuard only runs on those.
 */
@Module({
  controllers: [PlatformAuthController, PlatformTenantsController],
  providers: [
    PlatformAuthService,
    PlatformTenantsService,
    { provide: APP_GUARD, useClass: PlatformAuthGuard },
  ],
})
export class PlatformModule {}
