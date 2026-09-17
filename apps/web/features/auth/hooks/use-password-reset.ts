'use client';

import { useMutation } from '@tanstack/react-query';
import {
  authControllerForgotPassword,
  authControllerResetPassword,
} from '@org/api-client';

export function useForgotPassword() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await authControllerForgotPassword({ body: { email } });
      // 429 is the only realistic failure — the api answers 200 for unknown
      // emails on purpose (no account enumeration).
      if (error)
        throw new Error('Too many attempts. Wait a minute and try again.');
    },
  });
}

export function useResetPassword(opts?: { onSuccess?: () => void }) {
  return useMutation({
    mutationFn: async (input: { token: string; password: string }) => {
      const { error } = await authControllerResetPassword({ body: input });
      if (error) {
        const msg = (error as { message?: string }).message;
        throw new Error(msg || 'This reset link is invalid or has expired.');
      }
    },
    onSuccess: opts?.onSuccess,
  });
}
