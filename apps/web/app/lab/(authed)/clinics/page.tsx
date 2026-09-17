'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
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
  LinkStatusPill,
  useInviteClinic,
  useLabClinicLinks,
  useRevokeLabInvitation,
} from '@/features/lab';

export default function LabClinicsPage() {
  const { data, isLoading, error } = useLabClinicLinks();
  const invite = useInviteClinic();
  const revoke = useRevokeLabInvitation();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Associated clinics</h1>
          <p className="text-sm text-muted-foreground">
            Invite clinics by slug to unlock case ordering for them.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          {showForm ? 'Hide form' : 'Invite clinic'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Invite a clinic</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteForm
              invite={invite}
              onCancel={() => setShowForm(false)}
              onDone={() => setShowForm(false)}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          )}
          {!isLoading && data && data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No clinics yet. Invite your first one above.
            </p>
          )}

          <ul className="divide-y">
            {data?.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{link.clinic?.name ?? '—'}</span>
                    <LinkStatusPill status={link.status} />
                    {link.clinic?.type && (
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        {link.clinic.type}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                      {link.clinic?.slug}
                    </code>
                    {' · invited '}
                    {new Date(link.invitedAt).toLocaleDateString()}
                  </div>
                  {link.inviteNote && (
                    <p className="mt-1 max-w-md text-xs text-muted-foreground">
                      "{link.inviteNote}"
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  {link.status === 'PENDING' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(link.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function InviteForm({
  invite,
  onCancel,
  onDone,
}: {
  invite: ReturnType<typeof useInviteClinic>;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [clinicSlug, setClinicSlug] = useState('');
  const [inviteNote, setInviteNote] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    invite.mutate(
      {
        clinicSlug,
        inviteNote: inviteNote || undefined,
      },
      {
        onSuccess: () => {
          setClinicSlug('');
          setInviteNote('');
          onDone();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField label="Clinic slug">
        <Input
          required
          value={clinicSlug}
          onChange={(e) => setClinicSlug(e.target.value)}
          placeholder="acme-dental"
          autoComplete="off"
        />
        <p className="text-[11px] text-muted-foreground">
          The clinic's tenant slug. They must already have a ClinIQ tenant.
        </p>
      </FormField>

      <FormField label="Note (optional)">
        <textarea
          value={inviteNote}
          onChange={(e) => setInviteNote(e.target.value)}
          rows={3}
          maxLength={500}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Anything they should know about your lab — turnaround time, pricing tier, contact details, etc."
        />
      </FormField>

      {invite.error && (
        <p className="text-sm text-destructive">{(invite.error as Error).message}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!clinicSlug || invite.isPending}>
          {invite.isPending ? 'Sending…' : 'Send invitation'}
        </Button>
      </div>
    </form>
  );
}
