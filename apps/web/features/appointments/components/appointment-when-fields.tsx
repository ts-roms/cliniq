'use client';

import { DatePicker, Input } from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';

export interface AppointmentWhen {
  /** `YYYY-MM-DDTHH:mm` in browser local time — what the mutations expect. */
  startsAt: string;
  endsAt: string;
}

/** `YYYY-MM-DD` → local-midnight Date (avoid the UTC shift of `new Date(iso)`). */
function fromIsoDay(iso: string): Date | undefined {
  return iso ? new Date(`${iso}T00:00:00`) : undefined;
}

/** Local Date → `YYYY-MM-DD` in the browser's timezone. */
function toIsoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * shadcn "date and time" pattern for an appointment slot: one Calendar
 * popover for the day and two native time inputs. Both instants share the
 * day — clinic appointments don't cross midnight, and a single date keeps
 * the form to one pick.
 */
export function AppointmentWhenFields({
  value,
  onChange,
  errors,
}: {
  value: AppointmentWhen;
  onChange: (next: AppointmentWhen) => void;
  errors?: { startsAt?: string; endsAt?: string };
}) {
  const day = value.startsAt.slice(0, 10);
  const startTime = value.startsAt.slice(11, 16);
  const endTime = value.endsAt.slice(11, 16);

  return (
    <div className="space-y-3">
      <FormField label="Date">
        <DatePicker
          value={fromIsoDay(day)}
          onChange={(d) => {
            if (!d) return;
            const next = toIsoDay(d);
            onChange({
              startsAt: `${next}T${startTime || '09:00'}`,
              endsAt: `${next}T${endTime || '09:30'}`,
            });
          }}
          displayFormat="EEE, MMM d, yyyy"
          className="w-full"
        />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Starts" error={errors?.startsAt}>
          <Input
            type="time"
            value={startTime}
            onChange={(e) =>
              onChange({ ...value, startsAt: `${day}T${e.target.value}` })
            }
          />
        </FormField>
        <FormField label="Ends" error={errors?.endsAt}>
          <Input
            type="time"
            value={endTime}
            onChange={(e) =>
              onChange({ ...value, endsAt: `${day}T${e.target.value}` })
            }
          />
        </FormField>
      </div>
    </div>
  );
}
