import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actions } from '@org/auth';
import { Requires } from '../../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { LabInvoicesService } from '../../lab/invoices/lab-invoices.service.js';
import { InvoiceFilterDto } from '../../lab/invoices/dto/invoice.dto.js';

/**
 * Clinic-side read-only view of invoices the lab has issued to them.
 * Mounted at /api/clinic/lab-invoices. No feature gate — invoices belong
 * to the free associated-clinic surface (the clinic must be able to read
 * what they're being billed). Mutations stay on the lab side.
 */
@ApiTags('clinic-lab-invoices')
@ApiBearerAuth('jwt')
@Controller('clinic/lab-invoices')
export class ClinicLabInvoicesController {
  constructor(private readonly invoices: LabInvoicesService) {}

  @Get()
  @Requires(Actions.TENANT_MANAGE)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filter: InvoiceFilterDto,
  ) {
    return this.invoices.listForClinic(user, filter);
  }

  @Get(':id')
  @Requires(Actions.TENANT_MANAGE)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.findById(id, user);
  }

  @Get(':id/pdf')
  @Requires(Actions.TENANT_MANAGE)
  getPdf(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.getPdfAsClinic(id, user);
  }
}
