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
import { ClinicLabInvitationsController } from '../clinic/lab-invitations/clinic-lab-invitations.controller.js';
import { ClinicLabCasesController } from '../clinic/lab-cases/clinic-lab-cases.controller.js';

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
 *   /api/{lab|clinic}/.../signatures (both sides, no plan gate beyond consent feature)
 *   /api/clinic/lab-invitations      (clinic-side, no plan gate)
 *   /api/clinic/lab-cases            (clinic-side, no plan gate)
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
    ClinicLabInvitationsController,
    ClinicLabCasesController,
  ],
  providers: [
    LabClinicLinksService,
    LabProductsService,
    LabCasesService,
    LabTagsService,
    LabMaterialsService,
    LabComplianceService,
  ],
  exports: [
    LabClinicLinksService,
    LabProductsService,
    LabCasesService,
    LabTagsService,
    LabMaterialsService,
    LabComplianceService,
  ],
})
export class LabModule {}
