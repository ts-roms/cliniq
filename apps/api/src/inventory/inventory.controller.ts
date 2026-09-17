import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Features } from '@org/shared-types';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { InventoryService } from './inventory.service.js';
import {
  AdjustStockDto,
  CreateItemDto,
  DispenseStockDto,
  ReceiveBatchDto,
  UpdateItemDto,
} from './dto/inventory.dto.js';

@ApiTags('inventory')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.INVENTORY)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inv: InventoryService) {}

  @Get('items')
  @Requires(Actions.INVENTORY_READ)
  list(@Query('q') q: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.inv.listItems(user, q);
  }

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.INVENTORY_WRITE)
  @Audit({ action: 'inventory.itemCreate', entity: 'InventoryItem', entityIdFrom: 'result:id' })
  create(@Body() dto: CreateItemDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inv.createItem(dto, user);
  }

  @Get('items/:id')
  @Requires(Actions.INVENTORY_READ)
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.inv.detail(id, user);
  }

  @Patch('items/:id')
  @Requires(Actions.INVENTORY_WRITE)
  @Audit({ action: 'inventory.itemUpdate', entity: 'InventoryItem', entityIdFrom: 'param:id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inv.updateItem(id, dto, user);
  }

  @Post('items/:id/receive')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.INVENTORY_WRITE)
  @Audit({ action: 'inventory.receive', entity: 'StockBatch', entityIdFrom: 'result:id' })
  receive(
    @Param('id') id: string,
    @Body() dto: ReceiveBatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inv.receive(id, dto, user);
  }

  @Post('items/:id/dispense')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.INVENTORY_WRITE)
  @Audit({ action: 'inventory.dispense', entity: 'InventoryItem', entityIdFrom: 'param:id' })
  dispense(
    @Param('id') id: string,
    @Body() dto: DispenseStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inv.dispense(id, dto, user);
  }

  @Post('items/:id/adjust')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.INVENTORY_WRITE)
  @Audit({ action: 'inventory.adjust', entity: 'InventoryItem', entityIdFrom: 'param:id' })
  adjust(
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inv.adjust(id, dto, user);
  }

  @Get('reports/low-stock')
  @Requires(Actions.INVENTORY_READ)
  lowStock(@CurrentUser() user: AuthenticatedUser) {
    return this.inv.lowStock(user);
  }

  @Get('reports/expiring')
  @Requires(Actions.INVENTORY_READ)
  expiring(@Query('days') days: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    const n = days ? Math.max(1, Math.min(365, Number(days))) : 60;
    return this.inv.expiringSoon(user, n);
  }
}
