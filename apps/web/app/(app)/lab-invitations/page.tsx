'use client';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@org/ui';
import {
  LinkStatusPill,
  useAcceptInvitation,
  useClinicInvitations,
  useRejectInvitation,
} from '@/features/lab';

export default function ClinicLabInvitationsPage() {
  const { data, isLoading, error } = useClinicInvitations();
  const accept = useAcceptInvitation();
  const reject = useRejectInvitation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Lab partnerships</h1>
        <p className="text-sm text-muted-foreground">
          Invitations from dental laboratories. Accepting unlocks ordering with that lab.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Incoming &amp; active</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          )}
          {!isLoading && data && data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No invitations yet. Once a lab adds your clinic by slug, the request will show up here.
            </p>
          )}
          <ul className="divide-y">
            {data?.map((link) => (
              <li key={link.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{link.lab?.name ?? 'Unknown lab'}</span>
                    <LinkStatusPill status={link.status} />
                    {link.lab?.labSpecialty && (
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        {link.lab.labSpecialty.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                      {link.lab?.slug}
                    </code>
                    {' · invited '} {new Date(link.invitedAt).toLocaleDateString()}
                  </div>
                  {link.inviteNote && (
                    <p className="mt-1 max-w-md text-xs text-muted-foreground">
                      "{link.inviteNote}"
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  {link.status === 'PENDING' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reject.isPending}
                        onClick={() => reject.mutate(link.id)}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        disabled={accept.isPending}
                        onClick={() => accept.mutate(link.id)}
                      >
                        Accept
                      </Button>
                    </>
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
