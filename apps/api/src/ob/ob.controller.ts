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
import { ObService } from './ob.service.js';
import {
  CreateObVisitDto,
  CreatePregnancyDto,
  CreateUltrasoundDto,
  PresignUltrasoundFileDto,
  UpdatePregnancyDto,
} from './dto/ob.dto.js';

/**
 * OB/GYN + Ultrasound. Mounted at /api/ob.
 *
 * - /pregnancies + /visits gated by OBSTETRICS (Pro+).
 * - /ultrasound: 2D requires ULTRASOUND_2D, 3D/4D requires ULTRASOUND_3D_4D.
 *   We don't double-decorate per route — service-layer would need to
 *   inspect `kind` to enforce 3D/4D. For MVP we gate creation on
 *   ULTRASOUND_2D (the lower bar) and rely on the UI not exposing the
 *   3D/4D kind to non-Premium tenants. Tighten later if needed.
 */
@ApiTags('ob')
@ApiBearerAuth('jwt')
@Controller('ob')
export class ObController {
  constructor(private readonly ob: ObService) {}

  // ── Pregnancies ──────────────────────────────────────────

  @Get('pregnancies')
  @Requires(Actions.PATIENT_READ)
  @RequiresFeature(Features.OBSTETRICS)
  list(@CurrentUser() user: AuthenticatedUser, @Query('patientId') patientId: string) {
    return this.ob.listPregnancies(patientId, user);
  }

  @Post('pregnancies')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.PATIENT_WRITE)
  @RequiresFeature(Features.OBSTETRICS)
  @Audit({ action: 'ob.pregnancy.create', entity: 'ObPregnancy', entityIdFrom: 'result:id' })
  create(@Body() dto: CreatePregnancyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ob.createPregnancy(dto, user);
  }

  @Patch('pregnancies/:id')
  @Requires(Actions.PATIENT_WRITE)
  @RequiresFeature(Features.OBSTETRICS)
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePregnancyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ob.updatePregnancy(id, dto, user);
  }

  @Post('visits')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.PATIENT_WRITE)
  @RequiresFeature(Features.OBSTETRICS)
  @Audit({ action: 'ob.visit.create', entity: 'ObVisit', entityIdFrom: 'result:id' })
  createVisit(@Body() dto: CreateObVisitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ob.createVisit(dto, user);
  }

  // ── Ultrasound ───────────────────────────────────────────

  @Get('ultrasound')
  @Requires(Actions.PATIENT_READ)
  @RequiresFeature(Features.ULTRASOUND_2D)
  listUltrasounds(
    @CurrentUser() user: AuthenticatedUser,
    @Query('patientId') patientId: string,
  ) {
    return this.ob.listUltrasounds(patientId, user);
  }

  @Get('ultrasound/:id')
  @Requires(Actions.PATIENT_READ)
  @RequiresFeature(Features.ULTRASOUND_2D)
  findUltrasound(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ob.findUltrasoundById(id, user);
  }

  @Post('ultrasound')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.PATIENT_WRITE)
  @RequiresFeature(Features.ULTRASOUND_2D)
  @Audit({ action: 'ob.ultrasound.create', entity: 'UltrasoundReport', entityIdFrom: 'result:id' })
  createUltrasound(@Body() dto: CreateUltrasoundDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ob.createUltrasound(dto, user);
  }

  @Post('ultrasound/:id/files/presign')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.PATIENT_WRITE)
  @RequiresFeature(Features.ULTRASOUND_2D)
  @Audit({ action: 'ob.ultrasound.file.presign', entity: 'UltrasoundReport', entityIdFrom: 'param:id' })
  presignFile(
    @Param('id') id: string,
    @Body() dto: PresignUltrasoundFileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ob.presignFile(id, dto, user);
  }

  @Delete('ultrasound/:id/files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.PATIENT_WRITE)
  @RequiresFeature(Features.ULTRASOUND_2D)
  deleteFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ob.deleteUltrasoundFile(id, fileId, user);
  }
}
