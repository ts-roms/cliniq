import {
  Controller,
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
import { Audit } from '../../audit/audit.decorator.js';
import { Requires } from '../../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { LabClinicLinksService } from '../../lab/clinic-links/lab-clinic-links.service.js';

/**
 * Clinic-side endpoints for managing incoming lab invitations.
 * Mount at /api/clinic/lab-invitations — usable by any CLINIC tenant
 * regardless of subscription (the link itself is what unlocks lab ordering;
 * accepting it is free).
 */
@ApiTags('clinic-lab-invitations')
@ApiBearerAuth('jwt')
@Controller('clinic/lab-invitations')
export class ClinicLabInvitationsController {
  constructor(private readonly links: LabClinicLinksService) {}

  @Get()
  @Requires(Actions.TENANT_MANAGE)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.links.listForClinic(user);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'clinic.lab_invitation.accept',
    entity: 'LabClinicLink',
    entityIdFrom: 'param:id',
  })
  accept(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.links.accept(id, user);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'clinic.lab_invitation.reject',
    entity: 'LabClinicLink',
    entityIdFrom: 'param:id',
  })
  reject(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.links.reject(id, user);
  }

  @Patch(':id/suspend')
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'clinic.lab_invitation.suspend',
    entity: 'LabClinicLink',
    entityIdFrom: 'param:id',
  })
  suspend(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.links.setStatus(id, LabClinicLinkStatus.SUSPENDED, user);
  }

  @Patch(':id/reactivate')
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'clinic.lab_invitation.reactivate',
    entity: 'LabClinicLink',
    entityIdFrom: 'param:id',
  })
  reactivate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.links.setStatus(id, LabClinicLinkStatus.ACTIVE, user);
  }
}
