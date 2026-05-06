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
import { Features } from '@org/shared-types';
import { Audit } from '../../audit/audit.decorator.js';
import { Requires } from '../../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { LabCasesService } from './lab-cases.service.js';
import {
  AdvancePhaseDto,
  CreateMessageDto,
  CreateNoteDto,
  PresignLabCaseFileDto,
  TransitionLabCaseDto,
  UpdateLabCaseDto,
  UpdateNoteDto,
  UpsertShipmentDto,
} from './dto/case.dto.js';

/**
 * Lab-side endpoints for cases the lab has received from clinics.
 * Mounted at /api/lab/cases. Gated by LAB_ORDERS feature.
 */
@ApiTags('lab-cases')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LAB_ORDERS)
@Controller('lab/cases')
export class LabCasesController {
  constructor(private readonly cases: LabCasesService) {}

  @Get()
  @Requires(Actions.TENANT_MANAGE)
  @ApiQuery({ name: 'status', required: false, enum: LabCaseStatus, enumName: 'LabCaseStatus' })
  @ApiQuery({ name: 'tagId', required: false })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: LabCaseStatus,
    @Query('tagId') tagId?: string,
  ) {
    return this.cases.listForLab(user, { status, tagId });
  }

  @Get(':id')
  @Requires(Actions.TENANT_MANAGE)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cases.findById(id, user);
  }

  @Patch(':id')
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.case.update',
    entity: 'LabCase',
    entityIdFrom: 'param:id',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLabCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.updateAsLab(id, dto, user);
  }

  @Post(':id/transitions')
  @Requires(Actions.TENANT_MANAGE)
  @HttpCode(HttpStatus.OK)
  @Audit({
    action: 'lab.case.transition',
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
    action: 'lab.case.file.presign',
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
    action: 'lab.case.file.delete',
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

  // ── Phases ───────────────────────────────────────────────

  @Get(':id/phases')
  @Requires(Actions.TENANT_MANAGE)
  listPhases(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cases.listPhases(id, user);
  }

  @Post(':id/phases/advance')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_PHASES)
  @Audit({
    action: 'lab.case.phase.advance',
    entity: 'LabCase',
    entityIdFrom: 'param:id',
  })
  advancePhase(
    @Param('id') id: string,
    @Body() dto: AdvancePhaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.advancePhase(id, dto.phase, user, dto.notes);
  }

  // ── Notes (lab-only) ─────────────────────────────────────

  @Get(':id/notes')
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_INTERNAL_NOTES)
  listNotes(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cases.listNotes(id, user);
  }

  @Post(':id/notes')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_INTERNAL_NOTES)
  @Audit({
    action: 'lab.case.note.create',
    entity: 'LabCaseNote',
    entityIdFrom: 'result:id',
  })
  createNote(
    @Param('id') id: string,
    @Body() dto: CreateNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.createNote(id, dto.body, user);
  }

  @Patch(':id/notes/:noteId')
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_INTERNAL_NOTES)
  updateNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.updateNote(id, noteId, dto.body, user);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_INTERNAL_NOTES)
  deleteNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.deleteNote(id, noteId, user);
  }

  // ── Chat (both sides; lab side here) ─────────────────────

  @Get(':id/messages')
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_CHAT)
  listMessages(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cases.listMessages(id, user);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_CHAT)
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
  @RequiresFeature(Features.LAB_CHAT)
  deleteMessage(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.deleteMessage(id, messageId, user);
  }

  // ── Shipments ────────────────────────────────────────────

  @Get(':id/shipment')
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_SHIPMENTS)
  getShipment(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cases.getShipment(id, user);
  }

  @Post(':id/shipment')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_SHIPMENTS)
  @Audit({
    action: 'lab.case.shipment.upsert',
    entity: 'LabShipment',
    entityIdFrom: 'param:id',
  })
  upsertShipment(
    @Param('id') id: string,
    @Body() dto: UpsertShipmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.upsertShipment(id, dto, user);
  }

  @Post(':id/shipment/delivered')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_SHIPMENTS)
  @Audit({
    action: 'lab.case.shipment.delivered',
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
