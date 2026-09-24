import { Module } from '@nestjs/common';
import { DentalLabClinicLinksController } from './clinic-links/dental-lab-clinic-links.controller.js';
import { DentalLabClinicLinksService } from './clinic-links/dental-lab-clinic-links.service.js';
import { DentalLabProductsController } from './products/dental-lab-products.controller.js';
import { DentalLabProductsService } from './products/dental-lab-products.service.js';
import { DentalLabCasesController } from './cases/dental-lab-cases.controller.js';
import { DentalLabCasesService } from './cases/dental-lab-cases.service.js';
import { DentalLabTagsController } from './tags/dental-lab-tags.controller.js';
import { DentalLabTagsService } from './tags/dental-lab-tags.service.js';
import { DentalLabMaterialsController } from './materials/dental-lab-materials.controller.js';
import { DentalLabMaterialsService } from './materials/dental-lab-materials.service.js';
import { DentalLabComplianceController } from './compliance/dental-lab-compliance.controller.js';
import { DentalLabComplianceService } from './compliance/dental-lab-compliance.service.js';
import { DentalLabInvoicesController } from './invoices/dental-lab-invoices.controller.js';
import { DentalLabInvoicesService } from './invoices/dental-lab-invoices.service.js';
import { PaymongoService } from './invoices/paymongo.service.js';
import { PaymongoWebhookController } from './invoices/paymongo-webhook.controller.js';
import { DentalLabPdfRenderingService } from './_shared/pdf-rendering.service.js';
import { DentalLabCounterpartyService } from './_shared/counterparty.service.js';
import { DentalLabNotificationsService } from './_shared/dental-lab-notifications.service.js';
import { DentalLabStatsController } from './stats/dental-lab-stats.controller.js';
import { DentalLabStatsService } from './stats/dental-lab-stats.service.js';
import { DentalLabTreatmentPlansController } from './treatment-plans/dental-lab-treatment-plans.controller.js';
import { DentalLabTreatmentPlansService } from './treatment-plans/dental-lab-treatment-plans.service.js';
import { DentalLabDisputesController } from './disputes/dental-lab-disputes.controller.js';
import { DentalLabDisputesService } from './disputes/dental-lab-disputes.service.js';
import { ClinicLabInvitationsController } from '../clinic/lab-invitations/clinic-lab-invitations.controller.js';
import { ClinicLabCasesController } from '../clinic/lab-cases/clinic-lab-cases.controller.js';
import { ClinicLabInvoicesController } from '../clinic/lab-invoices/clinic-lab-invoices.controller.js';
import { ClinicLabTreatmentPlansController } from '../clinic/lab-treatment-plans/clinic-lab-treatment-plans.controller.js';
import { ClinicLabDisputesController } from '../clinic/lab-disputes/clinic-lab-disputes.controller.js';

/**
 * Lab module — surfaces:
 *   /api/dental-lab/clinic-links            (lab-side, gated by LAB_ORDERS)
 *   /api/dental-lab/categories              (lab-side, gated by LAB_CATALOG)
 *   /api/dental-lab/products                (lab-side, gated by LAB_CATALOG)
 *   /api/dental-lab/cases                   (lab-side, gated by LAB_ORDERS)
 *   /api/dental-lab/tags                    (lab-side, gated by LAB_TAGS)
 *   /api/dental-lab/materials               (lab-side, gated by LAB_MATERIALS_LOT)
 *   /api/dental-lab/conformity-templates    (lab-side, gated by LAB_CONFORMITY_DOCS)
 *   /api/dental-lab/consent-templates       (lab-side, gated by LAB_CONSENT_ESIGN)
 *   /api/dental-lab/invoices                (lab-side, gated by LAB_ORDERS;
 *                                     payment-links sub-routes gated by LAB_PAYMENT_LINKS)
 *   /api/{lab|clinic}/.../signatures (both sides, no plan gate beyond consent feature)
 *   /api/clinic/lab-invitations      (clinic-side, no plan gate)
 *   /api/clinic/lab-cases            (clinic-side, no plan gate)
 *   /api/clinic/lab-invoices         (clinic-side, read-only)
 *   /api/clinic/consent-templates    (clinic-side, no plan gate — needed to render consent)
 */
@Module({
  controllers: [
    DentalLabClinicLinksController,
    DentalLabProductsController,
    DentalLabCasesController,
    DentalLabTagsController,
    DentalLabMaterialsController,
    DentalLabComplianceController,
    DentalLabInvoicesController,
    PaymongoWebhookController,
    DentalLabStatsController,
    DentalLabTreatmentPlansController,
    DentalLabDisputesController,
    ClinicLabInvitationsController,
    ClinicLabCasesController,
    ClinicLabInvoicesController,
    ClinicLabTreatmentPlansController,
    ClinicLabDisputesController,
  ],
  providers: [
    DentalLabClinicLinksService,
    DentalLabProductsService,
    DentalLabCasesService,
    DentalLabTagsService,
    DentalLabMaterialsService,
    DentalLabComplianceService,
    DentalLabInvoicesService,
    DentalLabPdfRenderingService,
    DentalLabCounterpartyService,
    DentalLabNotificationsService,
    PaymongoService,
    DentalLabStatsService,
    DentalLabTreatmentPlansService,
    DentalLabDisputesService,
  ],
  exports: [
    DentalLabClinicLinksService,
    DentalLabProductsService,
    DentalLabCasesService,
    DentalLabTagsService,
    DentalLabMaterialsService,
    DentalLabComplianceService,
    DentalLabInvoicesService,
    DentalLabPdfRenderingService,
  ],
})
export class DentalLabModule {}
