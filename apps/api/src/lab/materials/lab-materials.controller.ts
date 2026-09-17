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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Features } from '@org/shared-types';
import { Audit } from '../../audit/audit.decorator.js';
import { Requires } from '../../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { LabMaterialsService } from './lab-materials.service.js';
import {
  CreateLotDto,
  CreateMaterialDto,
  RecordUsageDto,
  UpdateLotDto,
  UpdateMaterialDto,
} from './dto/material.dto.js';

/**
 * Lab-side materials + LOT inventory. Gated by LAB_MATERIALS_LOT (Standard+).
 *
 *   GET    /lab/materials                            — list with LOT counts
 *   POST   /lab/materials                            — create
 *   PATCH  /lab/materials/:id                        — rename / recategorize
 *   DELETE /lab/materials/:id                        — soft-delete
 *   GET    /lab/materials/:id/lots                   — LOTs for one material
 *   POST   /lab/materials/:id/lots                   — receive a new LOT
 *   PATCH  /lab/lots/:lotId                          — update status / notes
 *   DELETE /lab/lots/:lotId                          — soft-delete LOT
 *   GET    /lab/cases/:caseId/material-usages        — usages on a case
 *   POST   /lab/cases/:caseId/material-usages        — record usage (decrements LOT)
 *   DELETE /lab/cases/:caseId/material-usages/:id    — undo (restores LOT qty)
 */
@ApiTags('lab-materials')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LAB_MATERIALS_LOT)
@Controller('lab')
export class LabMaterialsController {
  constructor(private readonly mats: LabMaterialsService) {}

  // ── Materials ────────────────────────────────────────────

  @Get('materials')
  @Requires(Actions.TENANT_MANAGE)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.mats.listMaterials(user);
  }

  @Post('materials')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({ action: 'lab.material.create', entity: 'LabMaterial', entityIdFrom: 'result:id' })
  create(@Body() dto: CreateMaterialDto, @CurrentUser() user: AuthenticatedUser) {
    return this.mats.createMaterial(dto, user);
  }

  @Patch('materials/:id')
  @Requires(Actions.TENANT_MANAGE)
  @Audit({ action: 'lab.material.update', entity: 'LabMaterial', entityIdFrom: 'param:id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMaterialDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mats.updateMaterial(id, dto, user);
  }

  @Delete('materials/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({ action: 'lab.material.delete', entity: 'LabMaterial', entityIdFrom: 'param:id' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.mats.removeMaterial(id, user);
  }

  // ── LOTs ─────────────────────────────────────────────────

  @Get('materials/:id/lots')
  @Requires(Actions.TENANT_MANAGE)
  listLots(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.mats.listLots(id, user);
  }

  @Post('materials/:id/lots')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({ action: 'lab.lot.create', entity: 'LabMaterialLot', entityIdFrom: 'result:id' })
  createLot(
    @Param('id') id: string,
    @Body() dto: CreateLotDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mats.createLot(id, dto, user);
  }

  @Patch('lots/:lotId')
  @Requires(Actions.TENANT_MANAGE)
  @Audit({ action: 'lab.lot.update', entity: 'LabMaterialLot', entityIdFrom: 'param:lotId' })
  updateLot(
    @Param('lotId') lotId: string,
    @Body() dto: UpdateLotDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mats.updateLot(lotId, dto, user);
  }

  @Delete('lots/:lotId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({ action: 'lab.lot.delete', entity: 'LabMaterialLot', entityIdFrom: 'param:lotId' })
  removeLot(@Param('lotId') lotId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.mats.removeLot(lotId, user);
  }

  // ── Per-case usage ──────────────────────────────────────

  @Get('cases/:caseId/material-usages')
  @Requires(Actions.TENANT_MANAGE)
  listUsages(
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mats.listUsages(caseId, user);
  }

  @Post('cases/:caseId/material-usages')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.case.material.use',
    entity: 'LabCase',
    entityIdFrom: 'param:caseId',
  })
  recordUsage(
    @Param('caseId') caseId: string,
    @Body() dto: RecordUsageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mats.recordUsage(caseId, dto, user);
  }

  @Delete('cases/:caseId/material-usages/:usageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.case.material.unuse',
    entity: 'LabCase',
    entityIdFrom: 'param:caseId',
  })
  deleteUsage(
    @Param('caseId') caseId: string,
    @Param('usageId') usageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mats.deleteUsage(caseId, usageId, user);
  }
}
