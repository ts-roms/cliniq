'use client';

import { useSearchParams } from 'next/navigation';
import { SignupForm } from './signup-form';
import { AcceptInviteForm } from './accept-invite-form';

/**
 * /signup does double duty: the new-clinic wizard by default, and the
 * accept-invite form when the url carries ?invite=<token> (the link the
 * members invite email points at).
 */
export function SignupEntry() {
  const search = useSearchParams();
  const invite = search?.get('invite');
  if (invite) return <AcceptInviteForm token={invite} />;
  return <SignupForm />;
}
