'use client';

import { useMemo, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import {
  ALL_CLINIC_MODULES,
  CLINIC_MODULE_META,
  DEFAULT_MODULES_BY_CLINIC_TYPE,
  isClinicModule,
  planHasFeature,
  type ClinicModule,
  type ClinicType,
  type Plan,
} from '@org/shared-types';
import { useUpdateSettings } from '../hooks/use-settings';
import type { TenantSettings } from '../schemas/settings';

/**
 * Which clinical modules this clinic practises.
 *
 * Separate from the plan on purpose: the plan says what the tenant may use,
 * this says what it actually does. A cardiology clinic on PREMIUM has no use
 * for a dental chart, and before this existed every patient record carried
 * every specialty card regardless of clinic.
 *
 * Turning a module off never deletes anything. Patients who already have
 * records in it keep showing that module on their chart, flagged as outside
 * the clinic's configured scope.
 */
export function ModulesCard({
  tenant,
}: {
  tenant: TenantSettings & { type?: string | null; modules?: string[] };
}) {
  const update = useUpdateSettings();
  const clinicType = (tenant.type ?? 'GENERAL') as ClinicType;
  const plan = (tenant.plan ?? null) as Plan | null;

  const stored = (tenant.settings as { modules?: unknown } | null)?.modules;
  const initial = useMemo<ClinicModule[]>(
    () =>
      Array.isArray(stored)
        ? stored.filter(isClinicModule)
        : (DEFAULT_MODULES_BY_CLINIC_TYPE[clinicType] ??
          DEFAULT_MODULES_BY_CLINIC_TYPE.GENERAL),
    [stored, clinicType],
  );

  const [selected, setSelected] = useState<ClinicModule[]>(initial);
  const [saved, setSaved] = useState(false);

  const dirty =
    selected.length !== initial.length ||
    selected.some((m) => !initial.includes(m));

  function toggle(id: ClinicModule) {
    setSaved(false);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }

  function save() {
    // Sent as an explicit array so "none" is distinguishable from "never
    // configured" — the api falls back to clinic-type defaults only when the
    // key is absent.
    update.mutate(
      { modules: selected } as unknown as Parameters<typeof update.mutate>[0],
      { onSuccess: () => setSaved(true) },
    );
  }

  return (
    <Card data-test="clinic-modules-card">
      <CardHeader>
        <CardTitle>Clinical modules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Choose what this clinic does. Unselected modules are hidden from
          patient charts — except for patients who already have records in them,
          which stay visible and flagged.
        </p>

        <ul className="space-y-2">
          {ALL_CLINIC_MODULES.map((id) => {
            const meta = CLINIC_MODULE_META[id];
            const needs = meta.requiresFeature;
            const planBlocked = needs
              ? !plan || !planHasFeature(plan, needs)
              : false;
            const checked = selected.includes(id);
            return (
              <li key={id}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                    planBlocked ? 'opacity-60' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={checked}
                    disabled={planBlocked}
                    onChange={() => toggle(id)}
                    aria-describedby={`module-${id}-desc`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {meta.label}
                    </span>
                    <span
                      id={`module-${id}-desc`}
                      className="block text-xs text-muted-foreground"
                    >
                      {meta.description}
                      {planBlocked && (
                        <>
                          {' '}
                          <span className="font-medium">
                            Not included in your plan.
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={!dirty || update.isPending}>
            {update.isPending ? 'Saving…' : 'Save modules'}
          </Button>
          {dirty && (
            <Button
              variant="outline"
              onClick={() => {
                setSelected(initial);
                setSaved(false);
              }}
              disabled={update.isPending}
            >
              Reset
            </Button>
          )}
          {saved && !dirty && (
            <span className="text-sm text-muted-foreground">Saved.</span>
          )}
          {update.isError && (
            <span className="text-sm text-destructive">
              {(update.error as Error)?.message ?? 'Could not save'}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
