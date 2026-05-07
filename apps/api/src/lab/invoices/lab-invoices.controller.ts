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
import { Audit } from '../../audit/audit.decorator.js';
import { Requires } from '../../auth/decorators/requires.decorator.js';
import { RequiresFeature } from '../../auth/decorators/requires-feature.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { LabInvoicesService } from './lab-invoices.service.js';
import {
  AddInvoiceItemDto,
  CreateInvoiceDto,
  CreatePaymentLinkDto,
  GenerateFromCasesDto,
  InvoiceFilterDto,
  RecordPaymentDto,
  UpdateInvoiceDto,
  UpdateInvoiceItemDto,
} from './dto/invoice.dto.js';

/**
 * Lab-side invoice management. Mounted at /api/lab/invoices.
 *
 * Gated by LAB_ORDERS — every paid lab plan can issue invoices. Payment-link
 * endpoints carry an additional LAB_PAYMENT_LINKS gate (Standard+).
 */
@ApiTags('lab-invoices')
@ApiBearerAuth('jwt')
@RequiresFeature(Features.LAB_ORDERS)
@Controller('lab/invoices')
export class LabInvoicesController {
  constructor(private readonly invoices: LabInvoicesService) {}

  @Get()
  @Requires(Actions.TENANT_MANAGE)
  list(@CurrentUser() user: AuthenticatedUser, @Query() filter: InvoiceFilterDto) {
    return this.invoices.listForLab(user, filter);
  }

  @Get(':id')
  @Requires(Actions.TENANT_MANAGE)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.findById(id, user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.invoice.create',
    entity: 'LabInvoice',
    entityIdFrom: 'result:id',
  })
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.createDraft(dto, user);
  }

  @Post('generate-from-cases')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.invoice.generate_from_cases',
    entity: 'LabInvoice',
    entityIdFrom: 'result:id',
  })
  generate(
    @Body() dto: GenerateFromCasesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.generateFromCases(dto, user);
  }

  /**
   * Sweep delivered cases for a period and create one draft invoice per
   * clinic. Idempotent — re-runs skip cases already on a non-VOID invoice.
   * Designed for both manual ("Run for last month" button) and external
   * scheduler use (Railway cron / GitHub Actions hitting this with a
   * service-account JWT, mirroring /retention/run-now).
   */
  @Post('sweep')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.invoice.monthly_sweep',
    entity: 'LabInvoice',
  })
  sweep(
    @CurrentUser() user: AuthenticatedUser,
    @Query('period') period?: string,
  ) {
    return this.invoices.runMonthlySweep(period ?? null, user);
  }

  @Patch(':id')
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.invoice.update',
    entity: 'LabInvoice',
    entityIdFrom: 'param:id',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.update(id, dto, user);
  }

  // ── Items ────────────────────────────────────────────────

  @Post(':id/items')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.invoice.item.add',
    entity: 'LabInvoice',
    entityIdFrom: 'param:id',
  })
  addItem(
    @Param('id') id: string,
    @Body() dto: AddInvoiceItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.addItem(id, dto, user);
  }

  @Patch(':id/items/:itemId')
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.invoice.item.update',
    entity: 'LabInvoiceItem',
    entityIdFrom: 'param:itemId',
  })
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateInvoiceItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.updateItem(id, itemId, dto, user);
  }

  @Delete(':id/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.invoice.item.delete',
    entity: 'LabInvoiceItem',
    entityIdFrom: 'param:itemId',
  })
  deleteItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.deleteItem(id, itemId, user);
  }

  // ── Lifecycle ────────────────────────────────────────────

  @Post(':id/issue')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.invoice.issue',
    entity: 'LabInvoice',
    entityIdFrom: 'param:id',
  })
  issue(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.issue(id, user);
  }

  @Post(':id/payments')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.invoice.payment.record',
    entity: 'LabInvoice',
    entityIdFrom: 'param:id',
  })
  recordPayment(
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.recordPayment(id, dto, user);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.invoice.void',
    entity: 'LabInvoice',
    entityIdFrom: 'param:id',
  })
  voidInvoice(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.voidInvoice(id, user);
  }

  @Post(':id/pdf')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.invoice.pdf.generate',
    entity: 'LabInvoice',
    entityIdFrom: 'param:id',
  })
  generatePdf(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.generatePdfAsLab(id, user);
  }

  // ── Payment links (Standard+) ────────────────────────────

  @Post(':id/payment-links')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_PAYMENT_LINKS)
  @Audit({
    action: 'lab.invoice.payment_link.create',
    entity: 'LabPaymentLink',
    entityIdFrom: 'result:id',
  })
  createPaymentLink(
    @Param('id') id: string,
    @Body() dto: CreatePaymentLinkDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.createPaymentLink(id, dto, user);
  }

  @Delete(':id/payment-links/:linkId')
  @HttpCode(HttpStatus.OK)
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_PAYMENT_LINKS)
  @Audit({
    action: 'lab.invoice.payment_link.cancel',
    entity: 'LabPaymentLink',
    entityIdFrom: 'param:linkId',
  })
  cancelPaymentLink(
    @Param('id') id: string,
    @Param('linkId') linkId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.cancelPaymentLink(id, linkId, user);
  }
}
