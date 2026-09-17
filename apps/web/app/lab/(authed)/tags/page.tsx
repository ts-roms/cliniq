'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import {
  useCreateLabTag,
  useDeleteLabTag,
  useLabTags,
} from '@/features/lab';

const PRESET_COLORS = [
  '64748b', 'f59e0b', 'ef4444', '10b981', '3b82f6', '8b5cf6', 'ec4899', '14b8a6',
];

export default function LabTagsPage() {
  const { data, isLoading, error } = useLabTags();
  const create = useCreateLabTag();
  const remove = useDeleteLabTag();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), color },
      {
        onSuccess: () => {
          setName('');
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tags</h1>
        <p className="text-sm text-muted-foreground">
          Reusable labels for organizing and filtering cases. Lab-only — clinics don't see tags.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New tag</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <FormField label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rush"
                maxLength={64}
              />
            </FormField>
            <FormField label="Color">
              <div className="flex gap-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={
                      'h-7 w-7 rounded-full border-2 transition ' +
                      (color === c ? 'border-foreground scale-110' : 'border-transparent')
                    }
                    style={{ backgroundColor: `#${c}` }}
                    aria-label={`Use color ${c}`}
                  />
                ))}
              </div>
            </FormField>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending ? 'Adding…' : 'Add tag'}
            </Button>
          </form>
          {create.error && (
            <p className="mt-2 text-sm text-destructive">
              {(create.error as Error).message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing tags</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          )}
          {data && data.length === 0 && (
            <p className="text-sm text-muted-foreground">No tags yet.</p>
          )}
          <ul className="divide-y">
            {data?.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span
                  className="inline-block rounded-full px-3 py-0.5 text-sm font-medium"
                  style={{
                    backgroundColor: `#${t.color}20`,
                    color: `#${t.color}`,
                  }}
                >
                  {t.name}
                </span>
                <button
                  type="button"
                  onClick={() => remove.mutate(t.id)}
                  className="text-muted-foreground/60 hover:text-destructive"
                  aria-label={`Delete ${t.name}`}
                  disabled={remove.isPending}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
