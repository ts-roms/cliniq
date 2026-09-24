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
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { CatalogueService } from './catalogue.service.js';
import {
  CreateLabSectionDto,
  CreateLaboratoryTestDto,
  UpdateLabSectionDto,
  UpdateLaboratoryTestDto,
} from './dto/catalogue.dto.js';

/**
 * The laboratory test catalogue.
 *
 * Reads at CONSULT_READ: a clinician placing an order needs to see what the
 * laboratory offers, and what specimen it wants. Writes at CLINIC_ADMIN —
 * the catalogue defines what the lab claims it can perform, which is a
 * governance decision and, under DOH AO 2021-0037, bounded by the service
 * capability the lab is licensed for. When the role vocabulary grows a
 * LAB_HEAD / PATHOLOGIST, writes move there.
 *
 * Every write is audited.
 */
@ApiTags('lis')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LABS)
@Controller('lis')
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  // ── Sections ───────────────────────────────────────

  @Get('sections')
  @Requires(Actions.CONSULT_READ)
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  listSections(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.catalogue.listSections(user, includeInactive === 'true');
  }

  @Post('sections')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lis.sectionCreate',
    entity: 'LabSection',
    entityIdFrom: 'result:id',
  })
  createSection(
    @Body() dto: CreateLabSectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalogue.createSection(dto, user);
  }

  @Patch('sections/:id')
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lis.sectionUpdate',
    entity: 'LabSection',
    entityIdFrom: 'param:id',
  })
  updateSection(
    @Param('id') id: string,
    @Body() dto: UpdateLabSectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalogue.updateSection(id, dto, user);
  }

  // ── Tests ──────────────────────────────────────────

  @Get('tests')
  @Requires(Actions.CONSULT_READ)
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  listTests(
    @CurrentUser() user: AuthenticatedUser,
    @Query('sectionId') sectionId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.catalogue.listTests(user, {
      sectionId,
      includeInactive: includeInactive === 'true',
    });
  }

  @Get('tests/:id')
  @Requires(Actions.CONSULT_READ)
  getTest(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.catalogue.getTest(id, user);
  }

  @Post('tests')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lis.testCreate',
    entity: 'LaboratoryTest',
    entityIdFrom: 'result:id',
  })
  createTest(
    @Body() dto: CreateLaboratoryTestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalogue.createTest(dto, user);
  }

  @Patch('tests/:id')
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lis.testUpdate',
    entity: 'LaboratoryTest',
    entityIdFrom: 'param:id',
  })
  updateTest(
    @Param('id') id: string,
    @Body() dto: UpdateLaboratoryTestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.catalogue.updateTest(id, dto, user);
  }

  @Delete('tests/:id')
  @Requires(Actions.CLINIC_ADMIN)
  @Audit({
    action: 'lis.testRetire',
    entity: 'LaboratoryTest',
    entityIdFrom: 'param:id',
  })
  retireTest(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.catalogue.retireTest(id, user);
  }
}
