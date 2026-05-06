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
import { LabTagsService } from './lab-tags.service.js';
import { AssignTagDto, CreateTagDto, UpdateTagDto } from './dto/tag.dto.js';

/**
 * Lab-side tag management. Gated by LAB_TAGS (Standard+).
 *
 * Endpoints:
 *   GET    /lab/tags                       — list lab's tags
 *   POST   /lab/tags                       — create
 *   PATCH  /lab/tags/:id                   — rename / recolor
 *   DELETE /lab/tags/:id                   — soft-delete
 *   GET    /lab/cases/:caseId/tags         — tags on a case
 *   POST   /lab/cases/:caseId/tags         — assign a tag (idempotent)
 *   DELETE /lab/cases/:caseId/tags/:tagId  — unassign (idempotent)
 */
@ApiTags('lab-tags')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LAB_TAGS)
@Controller('lab')
export class LabTagsController {
  constructor(private readonly tags: LabTagsService) {}

  @Get('tags')
  @Requires(Actions.TENANT_MANAGE)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.tags.list(user);
  }

  @Post('tags')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({ action: 'lab.tag.create', entity: 'LabCaseTag', entityIdFrom: 'result:id' })
  create(@Body() dto: CreateTagDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tags.create(dto, user);
  }

  @Patch('tags/:id')
  @Requires(Actions.TENANT_MANAGE)
  @Audit({ action: 'lab.tag.update', entity: 'LabCaseTag', entityIdFrom: 'param:id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tags.update(id, dto, user);
  }

  @Delete('tags/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({ action: 'lab.tag.delete', entity: 'LabCaseTag', entityIdFrom: 'param:id' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tags.remove(id, user);
  }

  @Get('cases/:caseId/tags')
  @Requires(Actions.TENANT_MANAGE)
  listForCase(
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tags.listForCase(caseId, user);
  }

  @Post('cases/:caseId/tags')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.case.tag.assign',
    entity: 'LabCase',
    entityIdFrom: 'param:caseId',
  })
  assign(
    @Param('caseId') caseId: string,
    @Body() dto: AssignTagDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tags.assign(caseId, dto.tagId, user);
  }

  @Delete('cases/:caseId/tags/:tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.case.tag.unassign',
    entity: 'LabCase',
    entityIdFrom: 'param:caseId',
  })
  unassign(
    @Param('caseId') caseId: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tags.unassign(caseId, tagId, user);
  }
}
