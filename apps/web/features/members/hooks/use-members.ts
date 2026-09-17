'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  membersControllerChangeRole,
  membersControllerChangeStatus,
  membersControllerCreateInvite,
  membersControllerList,
  membersControllerListInvites,
  membersControllerRemove,
  membersControllerResendInvite,
  membersControllerRevokeInvite,
} from '@org/api-client';

export type StaffRole = 'OWNER' | 'ADMIN' | 'DOCTOR' | 'NURSE' | 'RECEPTIONIST';
export type MemberStatus = 'ACTIVE' | 'SUSPENDED' | 'INVITED';

export interface Member {
  id: string;
  role: StaffRole;
  status: MemberStatus;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    lastLogin: string | null;
    mfaEnabled: boolean;
  };
}

export interface PendingInvite {
  id: string;
  email: string;
  role: StaffRole;
  expiresAt: string;
  createdAt: string;
  invitedBy: { id: string; name: string; email: string };
}

export const memberKeys = {
  all: ['members'] as const,
  invites: ['members', 'invites'] as const,
};

function messageOf(error: unknown, fallback: string): string {
  const msg = (error as { message?: string | string[] } | undefined)?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg || fallback;
}

export function useMembers() {
  return useQuery({
    queryKey: memberKeys.all,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await membersControllerList();
      if (error) throw new Error(messageOf(error, 'Failed to load members'));
      return (data as unknown as Member[]) ?? [];
    },
  });
}

export function usePendingInvites() {
  return useQuery({
    queryKey: memberKeys.invites,
    queryFn: async (): Promise<PendingInvite[]> => {
      const { data, error } = await membersControllerListInvites();
      if (error) throw new Error(messageOf(error, 'Failed to load invites'));
      return (data as unknown as PendingInvite[]) ?? [];
    },
  });
}

export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; role: StaffRole }) => {
      const { data, error } = await membersControllerCreateInvite({
        body: input,
      });
      if (error || !data)
        throw new Error(messageOf(error, 'Could not send the invite'));
      return data as unknown as PendingInvite & { inviteUrl: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.invites }),
  });
}

export function useResendInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await membersControllerResendInvite({
        path: { id },
      });
      if (error || !data)
        throw new Error(messageOf(error, 'Could not resend the invite'));
      return data as unknown as PendingInvite & { inviteUrl: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.invites }),
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await membersControllerRevokeInvite({ path: { id } });
      if (error)
        throw new Error(messageOf(error, 'Could not revoke the invite'));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.invites }),
  });
}

export function useChangeRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; role: StaffRole }) => {
      const { error } = await membersControllerChangeRole({
        path: { id: input.id },
        body: { role: input.role },
      });
      if (error) throw new Error(messageOf(error, 'Could not change the role'));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.all }),
  });
}

export function useChangeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: 'ACTIVE' | 'SUSPENDED';
    }) => {
      const { error } = await membersControllerChangeStatus({
        path: { id: input.id },
        body: { status: input.status },
      });
      if (error)
        throw new Error(messageOf(error, 'Could not change the status'));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.all }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await membersControllerRemove({ path: { id } });
      if (error)
        throw new Error(messageOf(error, 'Could not remove the member'));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.all }),
  });
}
