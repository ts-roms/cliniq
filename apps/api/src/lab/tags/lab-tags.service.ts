import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import type { CreateTagDto, UpdateTagDto } from './dto/tag.dto.js';

@Injectable()
export class LabTagsService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labCaseTag.findMany({
        where: { tenantId: user.tenantId, deletedAt: null },
        orderBy: { name: 'asc' },
      }),
    );
  }

  async create(dto: CreateTagDto, user: AuthenticatedUser) {
    await this.requireLab(user);
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      try {
        return await tx.labCaseTag.create({
          data: {
            tenantId: user.tenantId,
            name: dto.name,
            color: dto.color ?? '64748b',
          },
        });
      } catch (err: unknown) {
        if (
          typeof err === 'object' &&
          err &&
          'code' in err &&
          (err as { code: string }).code === 'P2002'
        ) {
          throw new ConflictException(`Tag "${dto.name}" already exists`);
        }
        throw err;
      }
    });
  }

  async update(id: string, dto: UpdateTagDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const tag = await tx.labCaseTag.findFirst({
        where: { id, deletedAt: null },
      });
      if (!tag) throw new NotFoundException('tag not found');
      return tx.labCaseTag.update({
        where: { id },
        data: {
          name: dto.name ?? tag.name,
          color: dto.color ?? tag.color,
        },
      });
    });
  }

  async remove(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const tag = await tx.labCaseTag.findFirst({
        where: { id, deletedAt: null },
      });
      if (!tag) throw new NotFoundException('tag not found');
      await tx.labCaseTag.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }

  async assign(caseId: string, tagId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      // Confirm the case belongs to the lab and the tag is owned by the lab.
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, labTenantId: user.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!labCase) throw new NotFoundException('case not found');
      const tag = await tx.labCaseTag.findFirst({
        where: { id: tagId, tenantId: user.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!tag) throw new NotFoundException('tag not found');

      // Upsert by composite PK; idempotent.
      return tx.labCaseTagAssignment.upsert({
        where: { caseId_tagId: { caseId, tagId } },
        create: { caseId, tagId, taggedByUserId: user.userId },
        update: {},
      });
    });
  }

  async unassign(caseId: string, tagId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, labTenantId: user.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!labCase) throw new NotFoundException('case not found');
      await tx.labCaseTagAssignment.delete({
        where: { caseId_tagId: { caseId, tagId } },
      }).catch(() => {
        /* idempotent: already unassigned */
      });
    });
  }

  async listForCase(caseId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const labCase = await tx.labCase.findFirst({
        where: { id: caseId, labTenantId: user.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!labCase) throw new NotFoundException('case not found');
      const rows = await tx.labCaseTagAssignment.findMany({
        where: { caseId },
        include: { tag: true },
      });
      return rows.map((r) => r.tag);
    });
  }

  private async requireLab(user: AuthenticatedUser) {
    const t = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { kind: true },
    });
    if (!t || t.kind !== 'LAB') {
      throw new ForbiddenException('only LAB tenants can manage tags');
    }
  }
}
