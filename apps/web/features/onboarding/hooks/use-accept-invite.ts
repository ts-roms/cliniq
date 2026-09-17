'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  authControllerLogin,
  authControllerRegister,
  membersControllerPreviewInvite,
} from '@org/api-client';
import { saveSession, type Session } from '@/features/auth';

export interface InvitePreview {
  email: string;
  role: string;
  expiresAt: string;
  tenantSlug: string;
  tenantName: string;
}

/** What the accept page shows before the invitee picks a password. */
export function useInvitePreview(token: string | null) {
  return useQuery({
    queryKey: ['invite-preview', token],
    enabled: !!token,
    retry: false,
    queryFn: async (): Promise<InvitePreview> => {
      const { data, error } = await membersControllerPreviewInvite({
        query: { token: token ?? '' },
      });
      if (error || !data)
        throw new Error('This invite is invalid, expired, or already used.');
      return data as unknown as InvitePreview;
    },
  });
}

export interface AcceptInviteInput {
  token: string;
  tenantSlug: string;
  email: string;
  name: string;
  password: string;
}

/** Register via the invite token, then log in so we land with a session. */
export function useAcceptInvite(opts?: { onSuccess?: (s: Session) => void }) {
  return useMutation({
    mutationFn: async (input: AcceptInviteInput): Promise<Session> => {
      const { error: rErr } = await authControllerRegister({
        body: {
          email: input.email,
          name: input.name,
          password: input.password,
          tenantSlug: input.tenantSlug,
          inviteToken: input.token,
        },
      });
      if (rErr) {
        const msg = (rErr as { message?: string }).message;
        throw new Error(msg || 'Could not accept the invite.');
      }
      const { data: session, error: lErr } = await authControllerLogin({
        body: { email: input.email, password: input.password },
      });
      if (lErr || !session)
        throw new Error('Account created — please sign in.');
      return session as unknown as Session;
    },
    onSuccess: (session) => {
      saveSession(session);
      opts?.onSuccess?.(session);
    },
  });
}
