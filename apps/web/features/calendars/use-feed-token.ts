'use client';

import { useMutation } from '@tanstack/react-query';
import { calendarsControllerIssueToken } from '@org/api-client';
import { loadSession } from '@/features/auth/session';
import { API_BASE } from '@/shared/lib/api-base';

export interface FeedTokenResponse {
  providerId: string;
  providerName: string | null;
  token: string;
}

export function useIssueFeedToken() {
  return useMutation({
    mutationFn: async (
      providerId: string,
    ): Promise<FeedTokenResponse & { feedUrl: string }> => {
      const { data, error } = await calendarsControllerIssueToken({
        path: { id: providerId },
      });
      if (error || !data) throw new Error('Failed to mint calendar token');
      const session = loadSession();
      const tenantId = session?.user.tenantId ?? '';
      const resp = data as unknown as FeedTokenResponse;
      return {
        ...resp,
        feedUrl: `${API_BASE}/api/calendars/providers/${tenantId}/${resp.providerId}.ics?t=${resp.token}`,
      };
    },
  });
}
