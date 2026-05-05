import { z } from 'zod';

export const dsrTypeEnum = z.enum([
  'ACCESS',
  'CORRECTION',
  'ERASURE',
  'OBJECTION',
  'PORTABILITY',
]);
export type DsrType = z.infer<typeof dsrTypeEnum>;

export const dsrStatusEnum = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'REJECTED',
]);
export type DsrStatus = z.infer<typeof dsrStatusEnum>;

export const fileDsrSchema = z.object({
  patientId: z.string().min(1),
  type: dsrTypeEnum,
  details: z.string().max(2000).optional(),
});
export type FileDsrInput = z.infer<typeof fileDsrSchema>;

export const resolveDsrSchema = z.object({
  status: z.enum(['RESOLVED', 'REJECTED', 'IN_PROGRESS']),
  resolution: z.string().max(2000).optional(),
});
export type ResolveDsrInput = z.infer<typeof resolveDsrSchema>;

export interface Dsr {
  id: string;
  patientId: string;
  type: DsrType;
  status: DsrStatus;
  details: string | null;
  resolution: string | null;
  filedAt: string;
  resolvedAt: string | null;
  patient?: { id: string; firstName: string; lastName: string; mrn: string };
}
