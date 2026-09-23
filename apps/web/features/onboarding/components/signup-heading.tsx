'use client';

import { useSearchParams } from 'next/navigation';
import { CardDescription, CardTitle } from '@org/ui';

/**
 * The signup card's heading, matching whichever product the visitor picked on
 * the landing page (`?kind=`).
 *
 * It used to read "Start your clinic" unconditionally, which was wrong for
 * anyone arriving from the lab CTA — they were told to start a clinic on the
 * page where they finish signing up for a lab.
 *
 * With `?invite=` the page is an invite acceptance, not a new tenant at all,
 * so that gets its own wording.
 */
export function SignupHeading() {
  const search = useSearchParams();

  if (search?.get('invite')) {
    return (
      <>
        <CardTitle className="font-extralight">Join your team</CardTitle>
        <CardDescription>
          You were invited to an existing workspace. Set a password to accept.
        </CardDescription>
      </>
    );
  }

  const isLab = search?.get('kind')?.toLowerCase() === 'lab';

  return (
    <>
      <CardTitle className="font-extralight">
        {isLab ? 'Start your lab' : 'Start your clinic'}
      </CardTitle>
      <CardDescription>
        {isLab
          ? 'Free 30-day trial. Take digital case orders, track manufacturing, and invoice the clinics you work with.'
          : 'Free 30-day trial. Add patients, scribe consultations, prescribe — all in one place.'}
      </CardDescription>
    </>
  );
}
