import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@org/db';
import {
  labPlanHasFeature,
  planHasFeature,
  type Feature,
  type LabPlan,
  type Plan,
} from '@org/shared-types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { IS_PLATFORM_KEY } from '../../platform/decorators/platform-auth.decorator.js';
import { REQUIRES_FEATURE_KEY } from '../decorators/requires-feature.decorator.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';

/**
 * Plan-based feature gating. Runs after JwtAuthGuard, so req.user is set.
 *
 * Looks up the caller's tenant.plan once per request and compares against
 * the @RequiresFeature(...) metadata on the route/controller. Returns
 * 402 Payment Required (rather than 403) so the client can distinguish
 * "your plan doesn't include this" from "your role doesn't allow this"
 * and surface an upgrade CTA.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // Platform routes don't have a tenant plan — feature gating doesn't apply.
    const isPlatform = this.reflector.getAllAndOverride<boolean>(IS_PLATFORM_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPlatform) return true;

    // @Public routes have no authenticated user/tenant context — feature
    // gating doesn't apply (e.g. a patient joining a tele session via link
    // doesn't pay the clinic's subscription).
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Feature[] | undefined>(
      REQUIRES_FEATURE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!req.user) throw new UnauthorizedException('not authenticated');

    // Read the tenant inside its own RLS context — without this wrap,
    // the lookup runs as cliniq_app with no `current_tenant` GUC set,
    // and the `tenants_self_read` policy hides the row → null → 401.
    // Routes without @RequiresFeature don't hit this branch, which is
    // why patient endpoints work but lab/queue/OB previously didn't.
    const tenant = await this.prisma.withTenant(req.user.tenantId, null, (tx) =>
      tx.tenant.findUnique({
        where: { id: req.user!.tenantId },
        select: { kind: true, plan: true, labPlan: true },
      }),
    );
    if (!tenant) throw new UnauthorizedException('tenant not found');

    // Pick the right plan ladder based on tenant kind. Lab features are only
    // satisfied by lab plans; clinic features by clinic plans.
    const isLab = tenant.kind === 'LAB';
    const activePlan: Plan | LabPlan | null = isLab
      ? (tenant.labPlan as LabPlan | null)
      : (tenant.plan as Plan | null);
    if (!activePlan) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          message: `tenant has no active ${isLab ? 'lab' : 'clinic'} plan`,
          requiredFeatures: required,
          missingFeatures: required,
          currentPlan: null,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const has = isLab
      ? (f: Feature) => labPlanHasFeature(activePlan as LabPlan, f)
      : (f: Feature) => planHasFeature(activePlan as Plan, f);
    const missing = required.filter((f) => !has(f));
    if (missing.length > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          message: `plan ${activePlan} does not include: ${missing.join(', ')}`,
          requiredFeatures: required,
          missingFeatures: missing,
          currentPlan: activePlan,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}
