'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@org/ui';
import {
  useCreateLabCaseNote,
  useDeleteLabCaseNote,
  useLabCaseNotes,
} from '../hooks/use-lab';
import { useSession } from '@/features/auth';

interface Props {
  caseId: string;
}

/** Lab-only internal notes panel. The clinic doesn't see this section at all. */
export function NotesPanel({ caseId }: Props) {
  const { data, isLoading, error } = useLabCaseNotes(caseId);
  const create = useCreateLabCaseNote(caseId);
  const remove = useDeleteLabCaseNote(caseId);
  const session = useSession();
  const [draft, setDraft] = useState('');

  const submitting = create.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    create.mutate(draft, { onSuccess: () => setDraft('') });
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={4000}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Internal note (lab only — the clinic won't see this)…"
          disabled={submitting}
        />
        {create.error && (
          <p className="text-xs text-destructive">{(create.error as Error).message}</p>
        )}
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={submitting || !draft.trim()}>
            {submitting ? 'Adding…' : 'Add note'}
          </Button>
        </div>
      </form>

      {isLoading && <p className="text-xs text-muted-foreground">Loading notes…</p>}
      {error && (
        <p className="text-xs text-destructive">{(error as Error).message}</p>
      )}

      <ul className="space-y-2">
        {data?.map((n) => (
          <li
            key={n.id}
            className="rounded-md border border-border/60 bg-muted/30 px-3 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="whitespace-pre-wrap text-sm">{n.body}</p>
              {n.authorUserId === session?.user.id && (
                <button
                  type="button"
                  onClick={() => remove.mutate(n.id)}
                  className="text-muted-foreground/60 hover:text-destructive"
                  aria-label="Delete note"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {new Date(n.createdAt).toLocaleString()}
            </p>
          </li>
        ))}
        {data?.length === 0 && (
          <li className="text-xs text-muted-foreground">No notes yet.</li>
        )}
      </ul>
    </div>
  );
}
