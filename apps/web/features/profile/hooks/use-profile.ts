'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  meControllerStaffProfile,
  meControllerUpdateStaffProfile,
} from '@org/api-client';
import type { StaffProfile, StaffProfileOutput } from '../schemas/profile';

export const profileKeys = {
  staff: ['profile', 'staff'] as const,
};

export function useStaffProfile() {
  return useQuery({
    queryKey: profileKeys.staff,
    queryFn: async (): Promise<StaffProfile> => {
      const { data, error } = await meControllerStaffProfile();
      if (error || !data) throw new Error('Failed to load your profile');
      return data as unknown as StaffProfile;
    },
  });
}

export function useUpdateStaffProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StaffProfileOutput) => {
      // Blank optional fields clear the value on the api (null).
      const { data, error } = await meControllerUpdateStaffProfile({
        body: {
          name: input.name,
          prcLicenseNumber: input.prcLicenseNumber || null,
          prcLicenseExpiry: input.prcLicenseExpiry || null,
          prcSpecialty: input.prcSpecialty || null,
        },
      });
      if (error || !data) {
        const msg = (error as { message?: string | string[] } | undefined)
          ?.message;
        throw new Error(
          Array.isArray(msg) ? msg.join('; ') : (msg ?? 'Update failed'),
        );
      }
      return data as unknown as StaffProfile;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: profileKeys.staff }),
  });
}
