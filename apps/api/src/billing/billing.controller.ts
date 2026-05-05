import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Actions } from '@org/auth';
import { Audit } from '../audit/audit.decorator.js';
import { Requires } from '../auth/decorators/requires.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator.js';
import { BillingService } from './billing.service.js';
import {
  CreateInvoiceDto,
  CreateServiceDto,
  RecordPaymentDto,
} from './dto/billing.dto.js';

@ApiTags('billing')
@ApiBearerAuth('jwt')
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // ── Services ──────────────────────────────────────
  @Get('services')
  @Requires(Actions.BILLING_READ)
  listServices(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.listServices(user);
  }
  @Post('services')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.BILLING_WRITE)
  @Audit({ action: 'service.create', entity: 'Service', entityIdFrom: 'result:id' })
  createService(@Body() dto: CreateServiceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billing.createService(dto, user);
  }

  // ── Invoices ──────────────────────────────────────
  @Get('invoices')
  @Requires(Actions.BILLING_READ)
  listInvoices(@Query('patientId') patientId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.billing.listInvoicesForPatient(patientId, user);
  }
  @Post('invoices')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.BILLING_WRITE)
  @Audit({ action: 'invoice.create', entity: 'Invoice', entityIdFrom: 'result:id' })
  createInvoice(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billing.createInvoice(dto, user);
  }

  // ── Invoice PDF ───────────────────────────────────
  @Get('invoices/:id/pdf')
  @Requires(Actions.BILLING_READ)
  @Audit({ action: 'invoice.pdf', entity: 'Invoice', entityIdFrom: 'param:id' })
  async pdf(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pdf = await this.billing.renderInvoicePdf(id, user);
    res.set({
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="invoice-${id}.pdf"`,
      'content-length': pdf.length.toString(),
    });
    res.send(pdf);
    return undefined;
  }

  // ── Payments ──────────────────────────────────────
  @Post('invoices/:id/payments')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.BILLING_WRITE)
  @Audit({ action: 'payment.record', entity: 'Payment', entityIdFrom: 'result:id' })
  recordPayment(
    @Param('id') invoiceId: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.billing.recordPayment(invoiceId, dto, user);
  }
}
