import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Features } from '@org/shared-types';
import { Audit } from '../../audit/audit.decorator.js';
import { Requires } from '../../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { LabProductsService } from './lab-products.service.js';
import {
  CreateLabCategoryDto,
  CreateLabProductDto,
  UpdateLabCategoryDto,
  UpdateLabProductDto,
} from './dto/product.dto.js';

/**
 * Lab-side product catalog. Both endpoints are gated on LAB_CATALOG (every
 * paid lab tier) — non-paying labs can't curate a catalog.
 *
 * Linked clinics READ this catalog via separate endpoints under
 * /api/clinic/lab-catalog/:labId/* (Phase 1.4 pairs with the order flow).
 */
@ApiTags('lab-products')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LAB_CATALOG)
@Controller('lab')
export class LabProductsController {
  constructor(private readonly products: LabProductsService) {}

  // ── Categories ───────────────────────────────────────────

  @Get('categories')
  @Requires(Actions.TENANT_MANAGE)
  listCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.products.listCategories(user);
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.category.create',
    entity: 'LabProductCategory',
    entityIdFrom: 'result:id',
  })
  createCategory(
    @Body() dto: CreateLabCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.createCategory(dto, user);
  }

  @Patch('categories/:id')
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.category.update',
    entity: 'LabProductCategory',
    entityIdFrom: 'param:id',
  })
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateLabCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.updateCategory(id, dto, user);
  }

  @Delete('categories/:id')
  @Requires(Actions.TENANT_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    action: 'lab.category.delete',
    entity: 'LabProductCategory',
    entityIdFrom: 'param:id',
  })
  removeCategory(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.products.removeCategory(id, user);
  }

  // ── Products ─────────────────────────────────────────────

  @Get('products')
  @Requires(Actions.TENANT_MANAGE)
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'categoryId', required: false })
  listProducts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('activeOnly') activeOnly?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.products.listProducts(user, {
      activeOnly: activeOnly === 'true',
      categoryId,
    });
  }

  @Get('products/:id')
  @Requires(Actions.TENANT_MANAGE)
  findProduct(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.products.findProduct(id, user);
  }

  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.product.create',
    entity: 'LabProduct',
    entityIdFrom: 'result:id',
  })
  createProduct(
    @Body() dto: CreateLabProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.createProduct(dto, user);
  }

  @Patch('products/:id')
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.product.update',
    entity: 'LabProduct',
    entityIdFrom: 'param:id',
  })
  updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateLabProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.updateProduct(id, dto, user);
  }

  @Delete('products/:id')
  @Requires(Actions.TENANT_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    action: 'lab.product.delete',
    entity: 'LabProduct',
    entityIdFrom: 'param:id',
  })
  removeProduct(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.products.removeProduct(id, user);
  }

  @Post('products/:id/clone')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.product.clone',
    entity: 'LabProduct',
    entityIdFrom: 'result:id',
  })
  cloneProduct(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.products.cloneProduct(id, user);
  }
}
