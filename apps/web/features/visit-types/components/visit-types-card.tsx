'use client';

import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@org/ui';
import { ALL_CLINIC_MODULES, CLINIC_MODULE_META } from '@org/shared-types';
import {
  useCreateVisitType,
  useDeleteVisitType,
  useVisitTypes,
} from '../hooks/use-visit-types';

/**
 * Manage the clinic's checkup catalogue.
 *
 * Each entry names the clinical modules it focuses, which is what lets the
 * consult screen open the dental chart for a cleaning rather than every form
 * the product ships. Removing one is a soft delete: past appointments keep
 * saying what the visit was for.
 */
export function VisitTypesCard() {
  const { data, isLoading } = useVisitTypes({ includeInactive: false });
  const create = useCreateVisitType();
  const remove = useDeleteVisitType();

  const [name, setName] = useState('');
  const [modules, setModules] = useState<string[]>([]);

  function toggle(id: string) {
    setModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), modules },
      {
        onSuccess: () => {
          setName('');
          setModules([]);
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Visit types</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          What patients come in for. Staff pick one when booking or at check-in,
          and the consultation opens the forms that visit needs.
        </p>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {data && data.length > 0 && (
          <ul
            className="divide-y rounded-md border"
            data-test="visit-type-list"
          >
            {data.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium">{v.name}</span>
                  {v.isDefault && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                      default
                    </span>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {v.modules.length > 0
                      ? v.modules
                          .map((m) => CLINIC_MODULE_META[m].label)
                          .join(' · ')
                      : 'General visit — no module emphasis'}
                  </span>
                </div>
                <Button
                  variant="outline"
                  onClick={() => remove.mutate(v.id)}
                  disabled={remove.isPending}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        {data && data.length === 0 && (
          <p className="text-sm text-muted-foreground">
            None yet. Add one below — until then, booking shows no visit-type
            field at all.
          </p>
        )}

        <form onSubmit={submit} className="space-y-3 border-t pt-4">
          <div className="space-y-1">
            <label htmlFor="visit-type-name" className="text-sm font-medium">
              New visit type
            </label>
            <Input
              id="visit-type-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dental cleaning"
              maxLength={80}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs text-muted-foreground">
              Focuses these modules
            </legend>
            <div className="flex flex-wrap gap-2">
              {ALL_CLINIC_MODULES.map((id) => (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-xs"
                >
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={modules.includes(id)}
                    onChange={() => toggle(id)}
                  />
                  {CLINIC_MODULE_META[id].label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? 'Adding…' : 'Add visit type'}
            </Button>
            {create.isError && (
              <span className="text-sm text-destructive">
                {(create.error as Error)?.message ?? 'Could not add'}
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
