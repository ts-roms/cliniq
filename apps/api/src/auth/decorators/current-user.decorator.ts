import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ClinIqJwtPayload } from '@org/auth';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  role: ClinIqJwtPayload['role'];
  email?: string;
  /** Self-patient id for PATIENT-role portal users; undefined for staff. */
  patientId?: string;
  /**
   * When the request carries a valid X-Acting-For header, this is the user
   * whose authority is being exercised (the delegator). `role` above is
   * already overridden to the delegator's role for permission checks; this
   * field exists so audit/logging can record the actual identity vs the
   * exercised authority.
   */
  onBehalfOfUserId?: string;
  /** Effective scope filter from the active delegation. Empty = full proxy. */
  delegationScope?: string[];
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!req.user) throw new Error('CurrentUser used on an unauthenticated route');
    return req.user;
  }
);
