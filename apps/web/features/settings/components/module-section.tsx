'use client';

import { CLINIC_MODULE_META, type ClinicModule } from '@org/shared-types';

/**
 * Renders a specialty module card according to the clinic's configuration.
 *
 * Three outcomes:
 *   - module enabled                  -> render it normally
 *   - module off, patient has records -> render it, flagged (see below)
 *   - module off, no records          -> render nothing
 *
 * The middle case is the whole point. A clinic that narrows its configuration
 * does not stop having charted teeth on file, and a clinician who cannot see
 * data that IS in the patient's record is the outcome worth designing against.
 * Out-of-scope modules stay visible and carry a banner saying why.
 */
export function ModuleSection({
  module,
  enabled,
  hasData,
  children,
}: {
  module: ClinicModule;
  enabled: boolean;
  hasData: boolean;
  children: React.ReactNode;
}) {
  // The id is the link target used by the consult's "Visit focus" panel.
  if (enabled) {
    return (
      <div id={`module-${module}`} data-test={`module-${module}`}>
        {children}
      </div>
    );
  }
  if (!hasData) return null;

  const meta = CLINIC_MODULE_META[module];
  return (
    <div
      id={`module-${module}`}
      className="rounded-lg border border-amber-300 bg-amber-50/60 p-1 dark:border-amber-900/60 dark:bg-amber-950/20"
      data-test={`out-of-scope-module-${module}`}
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
        <span
          aria-hidden="true"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-400/80 text-[10px] font-bold text-amber-950"
        >
          !
        </span>
        <span>
          <span className="font-medium">{meta.label}</span> is not part of this
          clinic&rsquo;s configured services — shown because this patient has
          existing records.
        </span>
      </p>
      {children}
    </div>
  );
}
