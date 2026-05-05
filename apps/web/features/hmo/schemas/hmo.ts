import { z } from 'zod';

export const claimStatusEnum = z.enum([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'PARTIAL',
  'DENIED',
  'PAID',
  'CANCELLED',
]);
export type ClaimStatus = z.infer<typeof claimStatusEnum>;

export const createProviderSchema = z.object({
  name: z.string().min(1).max(120),
  payerCode: z.string().max(40).optional(),
  contactPhone: z.string().max(40).optional(),
  contactEmail: z.string().email().or(z.literal('')).optional(),
});
export type CreateProviderInput = z.infer<typeof createProviderSchema>;

export const createMembershipSchema = z.object({
  providerId: z.string().min(1),
  memberId: z.string().min(1).max(80),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
});
export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;

export const fileClaimSchema = z.object({
  membershipId: z.string().min(1, 'pick a membership'),
  claimedCentavos: z.coerce.number().int().min(0),
  notes: z.string().max(280).optional(),
});
export type FileClaimInput = z.input<typeof fileClaimSchema>;
export type FileClaimOutput = z.output<typeof fileClaimSchema>;

export const updateClaimSchema = z.object({
  status: claimStatusEnum.optional(),
  authNumber: z.string().max(80).optional(),
  approvedCentavos: z.coerce.number().int().min(0).optional(),
  patientResponsibilityCentavos: z.coerce.number().int().min(0).optional(),
  denialReason: z.string().max(280).optional(),
  notes: z.string().max(280).optional(),
});
export type UpdateClaimInput = z.input<typeof updateClaimSchema>;
export type UpdateClaimOutput = z.output<typeof updateClaimSchema>;

export const recordPaymentSchema = z.object({
  amountCentavos: z.coerce.number().int().min(1),
  reference: z.string().max(80).optional(),
});
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;
export type RecordPaymentOutput = z.output<typeof recordPaymentSchema>;

export interface HmoProvider {
  id: string;
  name: string;
  payerCode: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  active: boolean;
}

export interface HmoMembership {
  id: string;
  patientId: string;
  providerId: string;
  memberId: string;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
  provider: HmoProvider;
}

export interface HmoClaim {
  id: string;
  number: string;
  status: ClaimStatus;
  invoiceId: string;
  patientId: string;
  providerId: string;
  membershipId: string | null;
  authNumber: string | null;
  claimedCentavos: number;
  approvedCentavos: number;
  patientResponsibilityCentavos: number;
  denialReason: string | null;
  notes: string | null;
  submittedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  provider?: { id: string; name: string };
  patient?: { id: string; firstName: string; lastName: string; mrn: string };
  invoice?: {
    id: string;
    number: string;
    totalCentavos: number;
    paidCentavos: number;
  };
}
