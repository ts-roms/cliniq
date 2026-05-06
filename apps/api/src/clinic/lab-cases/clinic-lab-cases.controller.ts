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
import { LabCaseStatus } from '@org/db';
import { Actions } from '@org/auth';
import { Audit } from '../../audit/audit.decorator.js';
import { Requires } from '../../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { LabCasesService } from '../../lab/cases/lab-cases.service.js';
import {
  CreateLabCaseDto,
  CreateMessageDto,
  PresignLabCaseFileDto,
  TransitionLabCaseDto,
  UpdateLabCaseDto,
} from '../../lab/cases/dto/case.dto.js';

/**
 * Clinic-side endpoints for placing/managing lab cases.
 * Mounted at /api/clinic/lab-cases. No feature gate — clinics linked to a
 * paying lab get free access to the ordering surface.
 */
@ApiTags('clinic-lab-cases')
@ApiBearerAuth('jwt')
@Controller('clinic/lab-cases')
export class ClinicLabCasesController {
  constructor(private readonly cases: LabCasesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'clinic.lab_case.create',
    entity: 'LabCase',
    entityIdFrom: 'result:id',
  })
  create(@Body() dto: CreateLabCaseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cases.createDraft(dto, user);
  }

  @Get()
  @Requires(Actions.TENANT_MANAGE)
  @ApiQuery({ name: 'status', required: false, enum: LabCaseStatus, enumName: 'LabCaseStatus' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: LabCaseStatus,
  ) {
    return this.cases.listForClinic(user, { status });
  }

  @Get(':id')
  @Requires(Actions.TENANT_MANAGE)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cases.findById(id, user);
  }

  @Patch(':id')
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'clinic.lab_case.update',
    entity: 'LabCase',
    entityIdFrom: 'param:id',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLabCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.updateAsClinic(id, dto, user);
  }

  @Post(':id/transitions')
  @Requires(Actions.TENANT_MANAGE)
  @HttpCode(HttpStatus.OK)
  @Audit({
    action: 'clinic.lab_case.transition',
    entity: 'LabCase',
    entityIdFrom: 'param:id',
  })
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionLabCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.transition(id, dto, user);
  }

  @Post(':id/files/presign')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'clinic.lab_case.file.presign',
    entity: 'LabCase',
    entityIdFrom: 'param:id',
  })
  presignFile(
    @Param('id') id: string,
    @Body() dto: PresignLabCaseFileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.presignUpload(id, dto, user);
  }

  @Post(':id/files/:fileId/confirm')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  confirmFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.confirmUpload(id, fileId, user);
  }

  @Delete(':id/files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'clinic.lab_case.file.delete',
    entity: 'LabCaseFile',
    entityIdFrom: 'param:fileId',
  })
  deleteFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.deleteFile(id, fileId, user);
  }

  /** Read-only: clinics see manufacturing progress on their own cases. */
  @Get(':id/phases')
  @Requires(Actions.TENANT_MANAGE)
  listPhases(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cases.listPhases(id, user);
  }

  // ── Chat (clinic side) ───────────────────────────────────
  // No feature gate — chatting with the lab is part of the free
  // associated-clinic surface.

  @Get(':id/messages')
  @Requires(Actions.TENANT_MANAGE)
  listMessages(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cases.listMessages(id, user);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  createMessage(
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.createMessage(id, dto.body, user);
  }

  @Delete(':id/messages/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.TENANT_MANAGE)
  deleteMessage(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.deleteMessage(id, messageId, user);
  }

  // ── Shipments (clinic side, read + mark delivered) ───────

  @Get(':id/shipment')
  @Requires(Actions.TENANT_MANAGE)
  getShipment(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cases.getShipment(id, user);
  }

  @Post(':id/shipment/delivered')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'clinic.lab_case.shipment.delivered',
    entity: 'LabShipment',
    entityIdFrom: 'param:id',
  })
  markDelivered(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.markShipmentDelivered(id, user);
  }
}
