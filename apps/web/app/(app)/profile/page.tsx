'use client';

import { StaffProfileForm, useStaffProfile } from '@/features/profile';

export default function ProfilePage() {
  const { data, isLoading, error } = useStaffProfile();

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your account details and professional licence.
      </p>
      <div className="mt-6">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        )}
        {data && <StaffProfileForm profile={data} />}
      </div>
    </div>
  );
}
