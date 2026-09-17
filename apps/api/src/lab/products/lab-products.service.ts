import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LabProductPricingMode, PrismaService } from '@org/db';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import type {
  CreateLabCategoryDto,
  CreateLabProductDto,
  UpdateLabCategoryDto,
  UpdateLabProductDto,
} from './dto/product.dto.js';

@Injectable()
export class LabProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Categories ──────────────────────────────────────────────────

  listCategories(user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labProductCategory.findMany({
        where: { tenantId: user.tenantId, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    );
  }

  async createCategory(dto: CreateLabCategoryDto, user: AuthenticatedUser) {
    await this.requireLab(user);
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      if (dto.parentId) {
        const parent = await tx.labProductCategory.findFirst({
          where: { id: dto.parentId, deletedAt: null },
        });
        if (!parent) throw new BadRequestException('parent category not found');
      }
      return tx.labProductCategory.create({
        data: {
          tenantId: user.tenantId,
          name: dto.name,
          description: dto.description ?? null,
          parentId: dto.parentId ?? null,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    });
  }

  async updateCategory(id: string, dto: UpdateLabCategoryDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const cat = await tx.labProductCategory.findFirst({
        where: { id, deletedAt: null },
      });
      if (!cat) throw new NotFoundException('category not found');
      if (dto.parentId === id) {
        throw new BadRequestException('category cannot be its own parent');
      }
      return tx.labProductCategory.update({
        where: { id },
        data: {
          name: dto.name ?? cat.name,
          description: dto.description ?? cat.description,
          parentId: dto.parentId === undefined ? cat.parentId : dto.parentId,
          sortOrder: dto.sortOrder ?? cat.sortOrder,
        },
      });
    });
  }

  async removeCategory(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const cat = await tx.labProductCategory.findFirst({
        where: { id, deletedAt: null },
      });
      if (!cat) throw new NotFoundException('category not found');
      // Prefer soft-delete; products in this category get categoryId set to null via FK SET NULL.
      await tx.labProductCategory.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }

  // ── Products ────────────────────────────────────────────────────

  listProducts(user: AuthenticatedUser, opts?: { activeOnly?: boolean; categoryId?: string }) {
    return this.prisma.withTenant(user.tenantId, user.userId, (tx) =>
      tx.labProduct.findMany({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
          ...(opts?.activeOnly ? { isActive: true } : {}),
          ...(opts?.categoryId ? { categoryId: opts.categoryId } : {}),
        },
        orderBy: [{ name: 'asc' }],
        include: { category: { select: { id: true, name: true } } },
      }),
    );
  }

  async findProduct(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const product = await tx.labProduct.findFirst({
        where: { id, deletedAt: null },
        include: { category: { select: { id: true, name: true } } },
      });
      if (!product) throw new NotFoundException('product not found');
      return product;
    });
  }

  async createProduct(dto: CreateLabProductDto, user: AuthenticatedUser) {
    await this.requireLab(user);
    this.validatePricing(dto.pricingMode ?? LabProductPricingMode.FIXED, dto.defaultPrice);
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      if (dto.categoryId) {
        const cat = await tx.labProductCategory.findFirst({
          where: { id: dto.categoryId, deletedAt: null },
        });
        if (!cat) throw new BadRequestException('category not found');
      }
      try {
        return await tx.labProduct.create({
          data: {
            tenantId: user.tenantId,
            categoryId: dto.categoryId ?? null,
            sku: dto.sku ?? null,
            name: dto.name,
            description: dto.description ?? null,
            defaultPrice: dto.defaultPrice ?? null,
            currency: dto.currency ?? 'PHP',
            pricingMode: dto.pricingMode ?? LabProductPricingMode.FIXED,
            formSchema: dto.formSchema ?? undefined,
            phases: dto.phases ?? [],
            tags: dto.tags ?? [],
          },
        });
      } catch (err: unknown) {
        if (
          typeof err === 'object' &&
          err &&
          'code' in err &&
          (err as { code: string }).code === 'P2002'
        ) {
          throw new ConflictException(`SKU "${dto.sku}" already exists`);
        }
        throw err;
      }
    });
  }

  async updateProduct(id: string, dto: UpdateLabProductDto, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.labProduct.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) throw new NotFoundException('product not found');
      const nextMode = dto.pricingMode ?? existing.pricingMode;
      const nextPrice =
        dto.defaultPrice === undefined ? existing.defaultPrice : dto.defaultPrice;
      this.validatePricing(nextMode, nextPrice);
      return tx.labProduct.update({
        where: { id },
        data: {
          name: dto.name ?? existing.name,
          description: dto.description ?? existing.description,
          sku: dto.sku === undefined ? existing.sku : dto.sku,
          categoryId: dto.categoryId === undefined ? existing.categoryId : dto.categoryId,
          defaultPrice: nextPrice,
          currency: dto.currency ?? existing.currency,
          pricingMode: nextMode,
          formSchema: dto.formSchema === undefined ? undefined : dto.formSchema ?? undefined,
          phases: dto.phases ?? existing.phases,
          tags: dto.tags ?? existing.tags,
          isActive: dto.isActive ?? existing.isActive,
        },
      });
    });
  }

  async removeProduct(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const existing = await tx.labProduct.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) throw new NotFoundException('product not found');
      await tx.labProduct.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
    });
  }

  /** Clone a product into a new row — same lab, fresh SKU. */
  async cloneProduct(id: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(user.tenantId, user.userId, async (tx) => {
      const src = await tx.labProduct.findFirst({
        where: { id, deletedAt: null },
      });
      if (!src) throw new NotFoundException('product not found');
      return tx.labProduct.create({
        data: {
          tenantId: user.tenantId,
          categoryId: src.categoryId,
          sku: null, // cloned product starts without a SKU to avoid collision
          name: `${src.name} (copy)`,
          description: src.description,
          defaultPrice: src.defaultPrice,
          currency: src.currency,
          pricingMode: src.pricingMode,
          formSchema: src.formSchema ?? undefined,
          phases: src.phases,
          tags: src.tags,
          isActive: src.isActive,
        },
      });
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private async requireLab(user: AuthenticatedUser) {
    const t = await this.prisma.getTenantContext(user.tenantId);
    if (!t || t.kind !== 'LAB') {
      throw new ForbiddenException('only LAB tenants can manage product catalog');
    }
  }

  private validatePricing(mode: LabProductPricingMode, price: number | null | undefined) {
    if (mode === LabProductPricingMode.FIXED && (price === null || price === undefined)) {
      throw new BadRequestException(
        'FIXED pricing requires a defaultPrice (centavos)',
      );
    }
    if (mode === LabProductPricingMode.ADJUST_ON_ORDER && price !== null && price !== undefined) {
      throw new BadRequestException(
        'ADJUST_ON_ORDER pricing must not have a defaultPrice (set on order intake)',
      );
    }
  }
}
