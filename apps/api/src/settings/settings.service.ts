import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, type InputJsonValue } from '@org/db';
import {
  resolveClinicModules,
  type ClinicType,
  type Plan,
} from '@org/shared-types';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import type { UpdateSettingsDto } from './dto/settings.dto.js';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthenticatedUser) {
    // withTenant: the `tenants_self_read` policy needs the GUC; a bare
    // findFirst under cliniq_app returned null → 404 for every clinic.
    const tenant = await this.prisma.withTenant(
      user.tenantId,
      user.userId,
      (tx) =>
        tx.tenant.findFirst({
          where: { id: user.tenantId, deletedAt: null },
          select: {
            id: true,
            slug: true,
            name: true,
            country: true,
            timezone: true,
            currency: true,
            type: true,
            plan: true,
            settings: true,
          },
        }),
    );
    if (!tenant) throw new NotFoundException('tenant not found');

    // `modules` is derived, not stored: settings holds the clinic's explicit
    // choice (if any) and the tenant type supplies the default, then the plan
    // narrows it. Returning the resolved list means the web never has to
    // reproduce that precedence to decide what to render.
    const stored = (tenant.settings ?? {}) as { modules?: unknown };
    return {
      ...tenant,
      modules: resolveClinicModules({
        clinicType: tenant.type as ClinicType | null,
        plan: tenant.plan as Plan | null,
        configured: Array.isArray(stored.modules)
          ? (stored.modules as string[])
          : null,
      }),
    };
  }

  /**
   * Shallow-merge into the existing settings JSON. Undefined keys are kept,
   * explicit nulls clear them. operatingHours and acceptedPaymentMethods are
   * arrays — replaced wholesale, not merged element-wise. branding, extras
   * and labVerification are merged one level deeper, so a partial update does
   * not clear the sibling keys.
   */
  async update(dto: UpdateSettingsDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.tenant.findFirst({
        where: { id: user.tenantId, deletedAt: null },
        select: { settings: true },
      });
      if (!existing) throw new NotFoundException('tenant not found');

      const prev = (existing.settings ?? {}) as Record<string, unknown>;
      const next: Record<string, unknown> = {
        ...prev,
        ...dto,
        ...(dto.branding
          ? {
              branding: {
                ...((prev.branding as object) ?? {}),
                ...dto.branding,
              },
            }
          : {}),
        ...(dto.extras
          ? { extras: { ...((prev.extras as object) ?? {}), ...dto.extras } }
          : {}),
        // Merged, not replaced: sending only `required` must not silently
        // clear `requireSeparateVerifier` and quietly relax the policy.
        ...(dto.labVerification
          ? {
              labVerification: {
                ...((prev.labVerification as object) ?? {}),
                ...dto.labVerification,
              },
            }
          : {}),
      };

      return tx.tenant.update({
        where: { id: user.tenantId },
        data: { settings: next as InputJsonValue },
        select: { settings: true },
      });
    });
  }
}
