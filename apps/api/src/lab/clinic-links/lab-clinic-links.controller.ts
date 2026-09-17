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
import { LabClinicLinkStatus } from '@org/db';
import { Actions } from '@org/auth';
import { Features } from '@org/shared-types';
import { Audit } from '../../audit/audit.decorator.js';
import { Requires } from '../../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { LabClinicLinksService } from './lab-clinic-links.service.js';
import { InviteClinicDto } from './dto/invite.dto.js';

/**
 * Lab-side endpoints for managing the lab's clinic associations.
 * Mount at /api/lab/clinic-links — only LAB tenants can use these.
 */
@ApiTags('lab-clinic-links')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LAB_ORDERS)
@Controller('lab/clinic-links')
export class LabClinicLinksController {
  constructor(private readonly links: LabClinicLinksService) {}

  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.clinic_link.invite',
    entity: 'LabClinicLink',
    entityIdFrom: 'result:id',
  })
  invite(@Body() dto: InviteClinicDto, @CurrentUser() user: AuthenticatedUser) {
    return this.links.invite(dto, user);
  }

  @Get()
  @Requires(Actions.TENANT_MANAGE)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.links.listForLab(user);
  }

  @Delete(':id')
  @Requires(Actions.TENANT_MANAGE)
  @HttpCode(HttpStatus.OK)
  @Audit({
    action: 'lab.clinic_link.revoke',
    entity: 'LabClinicLink',
    entityIdFrom: 'param:id',
  })
  revoke(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.links.revoke(id, user);
  }

  @Patch(':id/suspend')
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.clinic_link.suspend',
    entity: 'LabClinicLink',
    entityIdFrom: 'param:id',
  })
  suspend(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.links.setStatus(id, LabClinicLinkStatus.SUSPENDED, user);
  }

  @Patch(':id/reactivate')
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.clinic_link.reactivate',
    entity: 'LabClinicLink',
    entityIdFrom: 'param:id',
  })
  reactivate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.links.setStatus(id, LabClinicLinkStatus.ACTIVE, user);
  }
}
