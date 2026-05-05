import { SetMetadata } from '@nestjs/common';
import { ConsentTypeDto } from '../dto/set-consent.dto.js';

export interface RequiresConsentMeta {
  type: ConsentTypeDto;
  /**
   * Where to find the patientId in the request. Default: try `req.params.patientId`,
   * then `req.params.id`, then `req.body.patientId`, then derive from `req.body.fileId`
   * (transcripts), then via consultation lookup.
   */
  patientIdFrom?:
    | 'param:patientId'
    | 'param:id'
    | 'body:patientId'
    | 'body:fileId-derived'
    | 'param:id-consultation';
}

export const REQUIRES_CONSENT_KEY = 'requiresConsent';

/**
 * Marks a route as requiring a specific patient consent. The interceptor
 * resolves the patientId from the request, calls ConsentsService.hasGranted,
 * and throws 403 if missing.
 */
export const RequiresConsent = (
  type: ConsentTypeDto,
  patientIdFrom?: RequiresConsentMeta['patientIdFrom'],
) => SetMetadata(REQUIRES_CONSENT_KEY, { type, patientIdFrom });
