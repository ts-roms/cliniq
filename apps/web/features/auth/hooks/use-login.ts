'use client';

import { useMutation } from '@tanstack/react-query';
import { authControllerLogin } from '@org/api-client';
import { saveSession, type LoginPayload } from '../session';

export interface LoginInput {
  email: string;
  password: string;
}

export function useLogin(opts?: { onSuccess?: () => void }) {
  return useMutation({
    mutationFn: async (input: LoginInput): Promise<LoginPayload> => {
      const { data, error } = await authControllerLogin({
        body: { email: input.email, password: input.password },
      });
      if (error || !data) throw new Error('Invalid credentials');
      // The api sets `cliniq.access` + `cliniq.refresh` httpOnly cookies in
      // the response — JS can't see them. We only persist the `user` block
      // in localStorage for UI-shell decisions; tokens stay server-side.
      return data as unknown as LoginPayload;
    },
    onSuccess: (payload) => {
      saveSession(payload);
      opts?.onSuccess?.();
    },
  });
}
