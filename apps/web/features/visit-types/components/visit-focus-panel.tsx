'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import { CLINIC_MODULE_META } from '@org/shared-types';
import { useVisitTypes } from '../hooks/use-visit-types';

/**
 * What this consult is for, and which records it should touch.
 *
 * The clinical editors for dental / OB / ultrasound live on the patient
 * chart, not here, so this panel names the focus and links straight to it
 * rather than pretending to embed those forms. That keeps the promise honest:
 * the clinician is told what this visit needs and is one click from it.
 *
 * Renders nothing for a consult with no visit type — a tenant that has not
 * set up a catalogue sees no change.
 */
export function VisitFocusPanel({
  visitTypeId,
  patientId,
}: {
  visitTypeId: string | null | undefined;
  patientId: string;
}) {
  const { data } = useVisitTypes({ includeInactive: true });
  if (!visitTypeId || !data) return null;

  const visit = data.find((v) => v.id === visitTypeId);
  if (!visit) return null;

  return (
    <Card data-test="visit-focus-panel">
      <CardHeader>
        <CardTitle>Visit focus</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm font-medium" data-test="visit-focus-name">
          {visit.name}
        </p>
        {visit.description && (
          <p className="text-xs text-muted-foreground">{visit.description}</p>
        )}

        {visit.modules.length > 0 ? (
          <>
            <p className="text-xs text-muted-foreground">
              Records this visit usually needs:
            </p>
            <ul className="flex flex-wrap gap-2">
              {visit.modules.map((m) => (
                <li key={m}>
                  <Link
                    href={`/patients/${patientId}#module-${m}`}
                    className="inline-block rounded-md border px-2 py-1 text-xs hover:bg-muted"
                  >
                    {CLINIC_MODULE_META[m].label}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            General visit — no particular records emphasised.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
