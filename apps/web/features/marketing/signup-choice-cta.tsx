'use client';

import Link from 'next/link';
import { Button } from '@org/ui';
import { useSession } from '@/features/auth';

interface Props {
  /** Tailwind classes forwarded to each rendered button. */
  className?: string;
  /** Variant for the lab button; the clinic one is always the primary. */
  labVariant?: 'default' | 'outline' | 'ghost';
}

/**
 * The two products, chosen here rather than on the signup page.
 *
 * ClinIQ sells to clinics and to dental labs, which are different tenant
 * kinds with different plans and a different app shell. That choice used to
 * be a toggle buried inside the signup card, so a lab owner followed a
 * generic "Start free trial" and then had to notice a control telling them
 * they were signing up for the wrong thing.
 *
 * `?kind=` carries the answer; SignupForm hides its toggle when it is set,
 * and SignupHeading matches the wording to it.
 *
 * Signed in, both collapse to a single "Go to dashboard" — offering signup to
 * someone who already has a tenant is noise.
 */
export function SignupChoiceCta({ className, labVariant = 'outline' }: Props) {
  const session = useSession();

  if (session) {
    const href = session.user.role === 'PATIENT' ? '/portal' : '/patients';
    return (
      <Button asChild className={className}>
        <Link href={href}>Go to dashboard</Link>
      </Button>
    );
  }

  return (
    <>
      <Button asChild className={className} data-test="signup-clinic">
        <Link href="/signup?kind=clinic">Sign up for ClinIQ</Link>
      </Button>
      <Button
        asChild
        variant={labVariant}
        className={className}
        data-test="signup-lab"
      >
        {/* "Dental Lab", not "Lab": Features.LABS is in-clinic diagnostics
            ordered against a patient chart, while the LAB tenant kind is a
            dental laboratory. Same reason the hero says "dental-lab". */}
        <Link href="/signup?kind=lab">Sign up for Dental Lab</Link>
      </Button>
    </>
  );
}
