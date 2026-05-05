import { z } from 'zod';

export const delegationStatusEnum = z.enum(['ACTIVE', 'REVOKED', 'EXPIRED']);
export type DelegationStatus = z.infer<typeof delegationStatusEnum>;

export const createDelegationSchema = z
  .object({
    delegateeId: z.string().min(1),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    reason: z.string().max(280).optional(),
    scope: z.array(z.string()).max(50).optional(),
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: 'End time must be after start time',
    path: ['endsAt'],
  });
export type CreateDelegationInput = z.input<typeof createDelegationSchema>;
export type CreateDelegationOutput = z.output<typeof createDelegationSchema>;

export interface DelegationUserStub {
  id: string;
  name: string;
  email: string;
}

export interface DelegationRecord {
  id: string;
  delegatorId: string;
  delegateeId: string;
  startsAt: string;
  endsAt: string;
  reason?: string | null;
  scope: string[];
  status: DelegationStatus;
  revokedAt?: string | null;
  delegator?: DelegationUserStub;
  delegatee?: DelegationUserStub;
}
