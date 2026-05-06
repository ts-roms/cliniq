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
      savePlatformSession({
        accessToken: resp.accessToken,
        refreshToken: resp.refreshToken,
        admin: resp.admin,
      });
      opts?.onSuccess?.();
    },
  });
}
