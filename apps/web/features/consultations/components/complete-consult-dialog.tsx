'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@org/ui';
import { useCompleteConsultation } from '../hooks/use-consultation';

export interface CompleteConsultDialogProps {
  consultationId: string;
  /** Current SOAP snapshot used to decide whether to surface the blank warning. */
  soap: {
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
  };
  disabled?: boolean;
}

function isBlank(v: string | null): boolean {
  return !v || v.trim() === '';
}

/**
 * Wraps the consultation completion flow with:
 *   1. A confirmation step — completion locks the SOAP permanently.
 *   2. A pre-submit warning if none of S/O/A/P have content (the api will
 *      also reject this server-side, but warning early avoids a round-trip
 *      and lets the user cancel without firing the mutation).
 *
 * Server-side BadRequestException messages are surfaced inline so users see
 * "Cannot complete an empty consultation" if they push through anyway.
 */
export function CompleteConsultDialog({
  consultationId,
  soap,
  disabled,
}: CompleteConsultDialogProps) {
  const [open, setOpen] = useState(false);
  const complete = useCompleteConsultation(consultationId);

  const allBlank =
    isBlank(soap.subjective) &&
    isBlank(soap.objective) &&
    isBlank(soap.assessment) &&
    isBlank(soap.plan);

  const handleConfirm = async () => {
    try {
      await complete.mutateAsync();
      setOpen(false);
    } catch {
      // Error is rendered below via complete.error; keep the dialog open.
    }
  };

  // Reset any prior error when the user reopens the dialog.
  const onOpenChange = (next: boolean) => {
    if (next) complete.reset();
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          Mark complete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark consultation complete?</DialogTitle>
          <DialogDescription>
            This locks the SOAP note from further edits and stamps the end time.
            You can&rsquo;t reopen the consultation from here once it&rsquo;s
            closed.
          </DialogDescription>
        </DialogHeader>

        {allBlank && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              All four SOAP fields are blank. The server will reject this
              completion — document at least one field first.
            </span>
          </div>
        )}

        {complete.error && (
          <p className="text-sm text-destructive" role="alert">
            {(complete.error as Error).message}
          </p>
        )}

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={complete.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={complete.isPending || allBlank}
          >
            {complete.isPending ? 'Completing…' : 'Confirm complete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
