'use client';

import { useMutation } from '@tanstack/react-query';
import { authControllerLogin } from '@org/api-client';
import { saveSession, type Session } from '../session';

export interface LoginInput {
  email: string;
  password: string;
}

export function useLogin(opts?: { onSuccess?: () => void }) {
  return useMutation({
    mutationFn: async (input: LoginInput): Promise<Session> => {
      const { data, error } = await authControllerLogin({
        body: { email: input.email, password: input.password },
      });
      if (error || !data) throw new Error('Invalid credentials');
      return data as unknown as Session;
    },
    onSuccess: (session) => {
      saveSession(session);
      opts?.onSuccess?.();
    },
  });
}
