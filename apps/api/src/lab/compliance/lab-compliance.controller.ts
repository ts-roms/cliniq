import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
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
import { LabComplianceService } from './lab-compliance.service.js';
import {
  CaptureSignatureDto,
  CreateTemplateDto,
  UpdateTemplateDto,
} from './dto/compliance.dto.js';

/**
 * Compliance — conformity declarations + consent templates + e-signatures.
 * Conformity gating is LAB_CONFORMITY_DOCS; consent gating is LAB_CONSENT_ESIGN.
 * Signature capture is allowed from both lab and clinic side (clinic captures
 * the patient's signature).
 */
@ApiTags('lab-compliance')
@ApiBearerAuth('jwt')
@Controller()
export class LabComplianceController {
  constructor(private readonly compliance: LabComplianceService) {}

  // ── Conformity templates (lab only) ──────────────────────

  @Get('lab/conformity-templates')
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_CONFORMITY_DOCS)
  listConformity(@CurrentUser() user: AuthenticatedUser) {
    return this.compliance.listConformity(user);
  }

  @Post('lab/conformity-templates')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_CONFORMITY_DOCS)
  @Audit({
    action: 'lab.conformity.create',
    entity: 'LabConformityDocTemplate',
    entityIdFrom: 'result:id',
  })
  createConformity(
    @Body() dto: CreateTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.compliance.createConformity(dto, user);
  }

  @Patch('lab/conformity-templates/:id')
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_CONFORMITY_DOCS)
  updateConformity(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.compliance.updateConformity(id, dto, user);
  }

  @Delete('lab/conformity-templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_CONFORMITY_DOCS)
  removeConformity(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.compliance.removeConformity(id, user);
  }

  // ── Consent templates (lab + linked-clinic readable) ─────

  @Get('lab/consent-templates')
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_CONSENT_ESIGN)
  listConsentLab(@CurrentUser() user: AuthenticatedUser) {
    return this.compliance.listConsent(user);
  }

  @Post('lab/consent-templates')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_CONSENT_ESIGN)
  @Audit({
    action: 'lab.consent.create',
    entity: 'LabConsentTemplate',
    entityIdFrom: 'result:id',
  })
  createConsent(
    @Body() dto: CreateTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.compliance.createConsent(dto, user);
  }

  @Patch('lab/consent-templates/:id')
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_CONSENT_ESIGN)
  updateConsent(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.compliance.updateConsent(id, dto, user);
  }

  @Delete('lab/consent-templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Requires(Actions.TENANT_MANAGE)
  @RequiresFeature(Features.LAB_CONSENT_ESIGN)
  removeConsent(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.compliance.removeConsent(id, user);
  }

  /** Clinic-side: list consent templates available from linked labs. */
  @Get('clinic/consent-templates')
  @Requires(Actions.TENANT_MANAGE)
  listConsentClinic(@CurrentUser() user: AuthenticatedUser) {
    return this.compliance.listConsent(user);
  }

  // ── Signatures (both sides) ──────────────────────────────

  @Get('lab/cases/:caseId/signatures')
  @Requires(Actions.TENANT_MANAGE)
  listSignaturesLab(
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.compliance.listSignaturesForCase(caseId, user);
  }

  @Get('clinic/lab-cases/:caseId/signatures')
  @Requires(Actions.TENANT_MANAGE)
  listSignaturesClinic(
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.compliance.listSignaturesForCase(caseId, user);
  }

  @Post('clinic/lab-cases/:caseId/signatures')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'clinic.lab_case.consent.sign',
    entity: 'LabConsentSignature',
    entityIdFrom: 'result:id',
  })
  captureFromClinic(
    @Param('caseId') caseId: string,
    @Body() dto: CaptureSignatureDto,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.compliance.captureSignature(caseId, dto, user, { ip, userAgent });
  }

  @Post('lab/cases/:caseId/signatures')
  @HttpCode(HttpStatus.CREATED)
  @Requires(Actions.TENANT_MANAGE)
  @Audit({
    action: 'lab.case.consent.sign',
    entity: 'LabConsentSignature',
    entityIdFrom: 'result:id',
  })
  captureFromLab(
    @Param('caseId') caseId: string,
    @Body() dto: CaptureSignatureDto,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.compliance.captureSignature(caseId, dto, user, { ip, userAgent });
  }
}
