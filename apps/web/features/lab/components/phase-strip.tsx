'use client';

import { Check, ChevronRight } from 'lucide-react';
import { Button } from '@org/ui';
import { useAdvanceLabCasePhase, useLabCasePhases } from '../hooks/use-lab';

interface Props {
  caseId: string;
  /** Ordered list of phase names from the product. */
  productPhases: string[];
  /** Whether the viewer is the lab (can advance) or the clinic (read-only). */
  side: 'lab' | 'clinic';
  /** Status of the parent case — phase advance only valid in IN_PROGRESS. */
  caseStatus: string;
}

export function PhaseStrip({ caseId, productPhases, side, caseStatus }: Props) {
  const { data: events, isLoading } = useLabCasePhases(caseId, side);
  const advance = useAdvanceLabCasePhase(caseId);

  if (productPhases.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/60 px-3 py-3 text-xs text-muted-foreground">
        Product has no phases defined. Add phases on the product to enable
        manufacturing tracking.
      </div>
    );
  }

  const open = events?.find((e) => e.exitedAt === null) ?? null;
  const completedSet = new Set(
    (events ?? []).filter((e) => e.exitedAt !== null).map((e) => e.phase),
  );

  const canAdvance =
    side === 'lab' &&
    caseStatus === 'IN_PROGRESS' &&
    productPhases.indexOf(open?.phase ?? '') < productPhases.length - 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {productPhases.map((p, i) => {
          const isOpen = open?.phase === p;
          const isDone = completedSet.has(p);
          return (
            <div key={p} className="flex items-center gap-1">
              <PhasePill state={isOpen ? 'active' : isDone ? 'done' : 'todo'} label={p} />
              {i < productPhases.length - 1 && (
                <ChevronRight
                  className="h-3 w-3 text-muted-foreground/50"
                  aria-hidden
                />
              )}
            </div>
          );
        })}
      </div>

      {isLoading && (
        <p className="text-xs text-muted-foreground">Loading phases…</p>
      )}

      {canAdvance && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={advance.isPending}
            onClick={() => advance.mutate({})}
          >
            {advance.isPending ? 'Advancing…' : `Advance to "${nextPhase(productPhases, open?.phase)}"`}
          </Button>
          {advance.error && (
            <span className="text-xs text-destructive">
              {(advance.error as Error).message}
            </span>
          )}
        </div>
      )}

      {side === 'lab' && caseStatus === 'IN_PROGRESS' && !open && productPhases.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          disabled={advance.isPending}
          onClick={() => advance.mutate({})}
        >
          Start phase tracking ({productPhases[0]})
        </Button>
      )}
    </div>
  );
}

function PhasePill({
  state,
  label,
}: {
  state: 'todo' | 'active' | 'done';
  label: string;
}) {
  const cls =
    state === 'active'
      ? 'bg-primary/10 text-primary ring-1 ring-primary/40'
      : state === 'done'
        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900'
        : 'bg-muted text-muted-foreground';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {state === 'done' && <Check className="h-3 w-3" aria-hidden />}
      {label}
    </span>
  );
}

function nextPhase(phases: string[], current: string | undefined): string {
  if (!current) return phases[0];
  const idx = phases.indexOf(current);
  return idx >= 0 && idx < phases.length - 1 ? phases[idx + 1] : current;
}
