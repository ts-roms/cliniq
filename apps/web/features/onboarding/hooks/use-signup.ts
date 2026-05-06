'use client';

import { useMutation } from '@tanstack/react-query';
import {
  authControllerLogin,
  authControllerRegister,
  tenantsControllerCreate,
} from '@org/api-client';
import { saveSession, type Session } from '@/features/auth';
import type { SignupInput } from '../schemas/signup';

export function useSignup(opts?: { onSuccess?: () => void }) {
  return useMutation({
    mutationFn: async (input: SignupInput): Promise<Session> => {
      // 1. Create the tenant + owner shell user (no password yet).
      //    Forwards `kind` (CLINIC | LAB), and either `plan` or `labPlan`
      //    depending on the audience the user came in through. Omitted =
      //    api defaults to CLINIC + Plan.STARTER.
      const { data: tenant, error: tErr } = await tenantsControllerCreate({
        body: {
          slug: input.slug,
          name: input.clinicName,
          ownerEmail: input.ownerEmail,
          ownerName: input.ownerName,
          ...(input.kind ? { kind: input.kind } : {}),
          ...(input.plan ? { plan: input.plan } : {}),
          ...(input.labPlan ? { labPlan: input.labPlan } : {}),
        },
      });
      if (tErr || !tenant) {
        const msg = (tErr as { message?: string } | undefined)?.message ?? 'Could not create clinic';
        throw new Error(msg);
      }

      // 2. Register a regular user account so we can log in.
      //    The owner shell from step 1 lives separately for now (no password).
      const { data: registered, error: rErr } = await authControllerRegister({
        body: {
          email: input.ownerEmail,
          name: input.ownerName,
          password: input.password,
          tenantSlug: input.slug,
        },
      });
      if (rErr || !registered) {
        // The tenant was created; surface a usable error so user knows step 1 succeeded.
        const msg =
          (rErr as { message?: string } | undefined)?.message ??
          'Clinic created, but account creation failed. Try signing in.';
        throw new Error(msg);
      }

      // 3. Login flow returns the canonical session shape.
      const { data: session, error: lErr } = await authControllerLogin({
        body: { email: input.ownerEmail, password: input.password },
      });
      if (lErr || !session) {
        throw new Error('Account created — please sign in.');
      }
      return session as unknown as Session;
    },
    onSuccess: (session) => {
      saveSession(session);
      opts?.onSuccess?.();
    },
  });
}
