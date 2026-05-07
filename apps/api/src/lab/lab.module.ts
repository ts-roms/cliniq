import { Module } from '@nestjs/common';
import { LabClinicLinksController } from './clinic-links/lab-clinic-links.controller.js';
import { LabClinicLinksService } from './clinic-links/lab-clinic-links.service.js';
import { LabProductsController } from './products/lab-products.controller.js';
import { LabProductsService } from './products/lab-products.service.js';
import { LabCasesController } from './cases/lab-cases.controller.js';
import { LabCasesService } from './cases/lab-cases.service.js';
import { LabTagsController } from './tags/lab-tags.controller.js';
import { LabTagsService } from './tags/lab-tags.service.js';
import { LabMaterialsController } from './materials/lab-materials.controller.js';
import { LabMaterialsService } from './materials/lab-materials.service.js';
import { LabComplianceController } from './compliance/lab-compliance.controller.js';
import { LabComplianceService } from './compliance/lab-compliance.service.js';
import { LabInvoicesController } from './invoices/lab-invoices.controller.js';
import { LabInvoicesService } from './invoices/lab-invoices.service.js';
import { PaymongoService } from './invoices/paymongo.service.js';
import { PaymongoWebhookController } from './invoices/paymongo-webhook.controller.js';
import { LabPdfRenderingService } from './_shared/pdf-rendering.service.js';
import { LabStatsController } from './stats/lab-stats.controller.js';
import { LabStatsService } from './stats/lab-stats.service.js';
import { LabTreatmentPlansController } from './treatment-plans/lab-treatment-plans.controller.js';
import { LabTreatmentPlansService } from './treatment-plans/lab-treatment-plans.service.js';
import { ClinicLabInvitationsController } from '../clinic/lab-invitations/clinic-lab-invitations.controller.js';
import { ClinicLabCasesController } from '../clinic/lab-cases/clinic-lab-cases.controller.js';
import { ClinicLabInvoicesController } from '../clinic/lab-invoices/clinic-lab-invoices.controller.js';
import { ClinicLabTreatmentPlansController } from '../clinic/lab-treatment-plans/clinic-lab-treatment-plans.controller.js';

/**
 * Lab module — surfaces:
 *   /api/lab/clinic-links            (lab-side, gated by LAB_ORDERS)
 *   /api/lab/categories              (lab-side, gated by LAB_CATALOG)
 *   /api/lab/products                (lab-side, gated by LAB_CATALOG)
 *   /api/lab/cases                   (lab-side, gated by LAB_ORDERS)
 *   /api/lab/tags                    (lab-side, gated by LAB_TAGS)
 *   /api/lab/materials               (lab-side, gated by LAB_MATERIALS_LOT)
 *   /api/lab/conformity-templates    (lab-side, gated by LAB_CONFORMITY_DOCS)
 *   /api/lab/consent-templates       (lab-side, gated by LAB_CONSENT_ESIGN)
 *   /api/lab/invoices                (lab-side, gated by LAB_ORDERS;
 *                                     payment-links sub-routes gated by LAB_PAYMENT_LINKS)
 *   /api/{lab|clinic}/.../signatures (both sides, no plan gate beyond consent feature)
 *   /api/clinic/lab-invitations      (clinic-side, no plan gate)
 *   /api/clinic/lab-cases            (clinic-side, no plan gate)
 *   /api/clinic/lab-invoices         (clinic-side, read-only)
 *   /api/clinic/consent-templates    (clinic-side, no plan gate — needed to render consent)
 */
@Module({
  controllers: [
    LabClinicLinksController,
    LabProductsController,
    LabCasesController,
    LabTagsController,
    LabMaterialsController,
    LabComplianceController,
    LabInvoicesController,
    PaymongoWebhookController,
    LabStatsController,
    LabTreatmentPlansController,
    ClinicLabInvitationsController,
    ClinicLabCasesController,
    ClinicLabInvoicesController,
    ClinicLabTreatmentPlansController,
  ],
  providers: [
    LabClinicLinksService,
    LabProductsService,
    LabCasesService,
    LabTagsService,
    LabMaterialsService,
    LabComplianceService,
    LabInvoicesService,
    LabPdfRenderingService,
    PaymongoService,
    LabStatsService,
    LabTreatmentPlansService,
  ],
  exports: [
    LabClinicLinksService,
    LabProductsService,
    LabCasesService,
    LabTagsService,
    LabMaterialsService,
    LabComplianceService,
    LabInvoicesService,
    LabPdfRenderingService,
  ],
})
export class LabModule {}
