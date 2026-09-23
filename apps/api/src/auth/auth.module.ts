import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PortalScopeGuard } from './guards/portal-scope.guard.js';
import { RbacGuard } from './guards/rbac.guard.js';
import { FeatureGuard } from './guards/feature.guard.js';
import { DelegationsModule } from '../delegations/delegations.module.js';
import { MfaModule } from '../mfa/mfa.module.js';
import { MailerModule } from '../mailer/mailer.module.js';

@Module({
  imports: [DelegationsModule, MfaModule, MailerModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Apply globally. Order: JWT (set req.user) → PortalScope (is a portal
    // account allowed here at all?) → RBAC (role can?) → Feature (plan
    // unlocks?). Routes opt out of JWT with @Public, opt in to RBAC/Feature
    // with @Requires(...) / @RequiresFeature(...), and open themselves to
    // PATIENT-role callers with @PortalRoute().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PortalScopeGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_GUARD, useClass: FeatureGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
