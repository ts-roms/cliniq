'use client';

import { useMutation } from '@tanstack/react-query';
import {
  platformLogin,
  type PlatformLoginInput,
  type PlatformLoginResponse,
} from '../lib/api';
import { savePlatformSession } from '../session';

export function usePlatformLogin(opts?: { onSuccess?: () => void }) {
  return useMutation<PlatformLoginResponse, Error, PlatformLoginInput>({
    mutationFn: platformLogin,
    onSuccess: (resp) => {
      // The api already Set-Cookie'd the httpOnly platform cookies. We only
      // persist the admin identity in localStorage so the UI can decide
      // "show platform nav?" without an extra round-trip.
      savePlatformSession({ admin: resp.admin });
      opts?.onSuccess?.();
    },
  });
}
