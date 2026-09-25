'use client';

import { useState } from 'react';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@org/ui';
import {
  CLINIC_MODULE_META,
  type ClinicModule,
  type PatientModuleDecision,
} from '@org/shared-types';

/**
 * "Add service" — the specialty services this patient could use but has no
 * records in yet, as a menu in the chart header.
 *
 * The chart only opens what is relevant (records on file, or the clinic's own
 * specialty); everything else the clinic offers waits here, so a general
 * clinic's chart does not open with an empty odontogram and a pregnancy card
 * for every walk-in. Recommended entries carry the reason the rest of the
 * record points at them, and the trigger shows a dot when there is one.
 *
 * Modules the patient can never use (OB for a male patient) are named in a
 * footnote rather than silently dropped, so "where is the OB card?" has an
 * answer on screen.
 */
export function PatientServicesMenu({
  decisions,
  enabled,
  onOpen,
}: {
  decisions: PatientModuleDecision[];
  /** The clinic's modules — separates "not for this patient" from "not offered". */
  enabled: readonly ClinicModule[];
  onOpen: (module: ClinicModule) => void;
}) {
  const [open, setOpen] = useState(false);
  const offered = decisions
    .filter((d) => d.placement === 'offered')
    // Recommendations first.
    .sort((a, b) => Number(b.suggested) - Number(a.suggested));
  const notApplicable = decisions.filter(
    (d) => d.placement === 'hidden' && enabled.includes(d.module),
  );
  const hasRecommendation = offered.some((d) => d.suggested);

  if (offered.length === 0 && notApplicable.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          data-test="add-service-button"
          title="Open another service for this patient"
          className="relative"
        >
          + Add service
          {offered.length > 0 && (
            <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
              {offered.length}
            </span>
          )}
          {hasRecommendation && (
            <span
              aria-label="has a recommendation"
              className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-primary"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-2"
        data-test="patient-services-menu"
      >
        {offered.length > 0 ? (
          <>
            <p className="px-2 pb-1 pt-1 text-xs text-muted-foreground">
              Other services this clinic offers. Open one to start a record for
              this patient.
            </p>
            <ul className="space-y-0.5">
              {offered.map((d) => (
                <li key={d.module}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpen(d.module);
                    }}
                    data-test={`offer-module-${d.module}`}
                    data-suggested={d.suggested ? 'true' : undefined}
                    title={CLINIC_MODULE_META[d.module].description}
                    className={
                      d.suggested
                        ? 'flex w-full flex-col items-start rounded-md bg-primary/5 px-2 py-1.5 text-left text-sm hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                        : 'flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    }
                  >
                    <span className="font-medium">
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
          <p className="px-2 py-1 text-xs text-muted-foreground">
            Every service that applies to this patient is already open.
          </p>
        )}
        {notApplicable.length > 0 && (
          <p
            className="mt-2 border-t px-2 pt-2 text-xs text-muted-foreground"
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
      </PopoverContent>
    </Popover>
  );
}
