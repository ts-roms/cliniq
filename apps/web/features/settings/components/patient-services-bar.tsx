'use client';

import {
  CLINIC_MODULE_META,
  type ClinicModule,
  type PatientModuleDecision,
} from '@org/shared-types';

/**
 * The specialty services this patient could use but has no records in yet.
 *
 * The chart only opens what is relevant (records on file, or the clinic's own
 * specialty); everything else the clinic offers waits here as a chip, so a
 * general clinic's chart does not open with an empty odontogram and a
 * pregnancy card for every walk-in. Recommended chips carry the reason the
 * rest of the record points at them.
 *
 * Modules the patient can never use (OB for a male patient) are named in a
 * footnote rather than silently dropped, so "where is the OB card?" has an
 * answer on screen.
 */
export function PatientServicesBar({
  decisions,
  enabled,
  onOpen,
}: {
  decisions: PatientModuleDecision[];
  /** The clinic's modules — separates "not for this patient" from "not offered". */
  enabled: readonly ClinicModule[];
  onOpen: (module: ClinicModule) => void;
}) {
  const offered = decisions
    .filter((d) => d.placement === 'offered')
    // Recommendations first.
    .sort((a, b) => Number(b.suggested) - Number(a.suggested));
  const notApplicable = decisions.filter(
    (d) => d.placement === 'hidden' && enabled.includes(d.module),
  );

  if (offered.length === 0 && notApplicable.length === 0) return null;

  return (
    <section
      aria-labelledby="patient-services-heading"
      className="rounded-lg border border-dashed p-3 sm:p-4"
      data-test="patient-services-bar"
    >
      <h2
        id="patient-services-heading"
        className="text-sm font-medium text-foreground"
      >
        Add a service
      </h2>
      {offered.length > 0 ? (
        <>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Other services this clinic offers. Open one to start a record for
            this patient.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {offered.map((d) => (
              <li key={d.module}>
                <button
                  type="button"
                  onClick={() => onOpen(d.module)}
                  data-test={`offer-module-${d.module}`}
                  data-suggested={d.suggested ? 'true' : undefined}
                  title={CLINIC_MODULE_META[d.module].description}
                  className={
                    d.suggested
                      ? 'inline-flex flex-col items-start rounded-md border border-primary/50 bg-primary/5 px-3 py-1.5 text-left text-sm hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      : 'inline-flex flex-col items-start rounded-md border px-3 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  }
                >
                  <span className="font-medium">
                    <span aria-hidden="true">+ </span>
                    {CLINIC_MODULE_META[d.module].label}
                    {d.suggested && (
                      <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                        Recommended
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {d.reason}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Every service that applies to this patient is already open.
        </p>
      )}
      {notApplicable.length > 0 && (
        <p
          className="mt-3 text-xs text-muted-foreground"
          data-test="not-applicable-modules"
        >
          Not shown for this patient:{' '}
          {notApplicable
            .map(
              (d) =>
                `${CLINIC_MODULE_META[d.module].label} (${d.reason.toLowerCase()})`,
            )
            .join('; ')}
          .
        </p>
      )}
    </section>
  );
}
