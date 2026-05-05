import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import type { UpdateSettingsDto } from './dto/settings.dto.js';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthenticatedUser) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: user.tenantId, deletedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
        country: true,
        timezone: true,
        currency: true,
        plan: true,
        settings: true,
      },
    });
    if (!tenant) throw new NotFoundException('tenant not found');
    return tenant;
  }

  /**
   * Shallow-merge into the existing settings JSON. Undefined keys are kept,
   * explicit nulls clear them. operatingHours and acceptedPaymentMethods are
   * arrays — replaced wholesale, not merged element-wise.
   */
  async update(dto: UpdateSettingsDto, user: AuthenticatedUser) {
    const existing = await this.prisma.tenant.findFirst({
      where: { id: user.tenantId, deletedAt: null },
      select: { settings: true },
    });
    if (!existing) throw new NotFoundException('tenant not found');

    const prev = (existing.settings ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = {
      ...prev,
      ...dto,
      ...(dto.branding ? { branding: { ...(prev.branding as object ?? {}), ...dto.branding } } : {}),
      ...(dto.extras ? { extras: { ...(prev.extras as object ?? {}), ...dto.extras } } : {}),
    };

    return this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: { settings: next },
      select: { settings: true },
    });
  }
}
