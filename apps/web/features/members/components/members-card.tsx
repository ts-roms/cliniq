'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Copy, ShieldCheck } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Select,
} from '@org/ui';
import { useSession } from '@/features/auth';
import { FormField } from '@/shared/components/forms/form-field';
import {
  useChangeRole,
  useChangeStatus,
  useCreateInvite,
  useMembers,
  usePendingInvites,
  useRemoveMember,
  useResendInvite,
  useRevokeInvite,
  type Member,
  type PendingInvite,
  type StaffRole,
} from '../hooks/use-members';

const STAFF_ROLES: StaffRole[] = [
  'OWNER',
  'ADMIN',
  'DOCTOR',
  'NURSE',
  'RECEPTIONIST',
];

function labelRole(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  SUSPENDED: 'bg-zinc-200 text-zinc-700',
  INVITED: 'bg-amber-100 text-amber-800',
};

/**
 * Staff roster + invites. Only OWNER / ADMIN reach this card (the settings
 * page is admin-gated); the api additionally refuses ADMIN → OWNER grants
 * and self-edits, and this component mirrors those rules so the buttons
 * don't promise what the server will refuse.
 */
export function MembersCard() {
  const session = useSession();
  const members = useMembers();
  const invites = usePendingInvites();
  const isOwner = session?.user.role === 'OWNER';
  const myUserId = session?.user.id;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Team</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Staff join by invite only. Roles change here; a suspended member is
            signed out everywhere within minutes.
          </p>
        </div>
        <InviteDialog isOwner={isOwner} />
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          {members.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {members.error && (
            <p className="text-sm text-destructive">
              {(members.error as Error).message}
            </p>
          )}
          {members.data && (
            <ul className="divide-y rounded border bg-card">
              {members.data.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isOwner={isOwner}
                  isSelf={m.user.id === myUserId}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Pending invites</h3>
          {invites.data && invites.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No open invites.</p>
          )}
          {invites.data && invites.data.length > 0 && (
            <ul className="divide-y rounded border bg-card">
              {invites.data.map((i) => (
                <InviteRow key={i.id} invite={i} />
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function MemberRow({
  member: m,
  isOwner,
  isSelf,
}: {
  member: Member;
  isOwner: boolean;
  isSelf: boolean;
}) {
  const changeRole = useChangeRole();
  const changeStatus = useChangeStatus();
  const remove = useRemoveMember();
  const busy =
    changeRole.isPending || changeStatus.isPending || remove.isPending;
  const error = changeRole.error ?? changeStatus.error ?? remove.error;

  // ADMIN can't touch an OWNER; nobody edits themselves.
  const locked = isSelf || (m.role === 'OWNER' && !isOwner);
  const roleOptions = isOwner
    ? STAFF_ROLES
    : STAFF_ROLES.filter((r) => r !== 'OWNER');

  return (
    <li className="p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{m.user.name}</span>
            {isSelf && (
              <span className="text-xs text-muted-foreground">(you)</span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[m.status] ?? ''}`}
            >
              {m.status}
            </span>
            {m.user.mfaEnabled && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> MFA
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {m.user.email}
            {m.user.lastLogin &&
              ` · last sign-in ${new Date(m.user.lastLogin).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label={`Role for ${m.user.name}`}
            className="h-9 w-40"
            value={m.role}
            disabled={locked || busy}
            onChange={(e) =>
              changeRole.mutate({ id: m.id, role: e.target.value as StaffRole })
            }
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {labelRole(r)}
              </option>
            ))}
            {!roleOptions.includes(m.role) && (
              <option value={m.role}>{labelRole(m.role)}</option>
            )}
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={locked || busy}
            onClick={() =>
              changeStatus.mutate({
                id: m.id,
                status: m.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
              })
            }
          >
            {m.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={locked || busy}
            onClick={() => {
              if (window.confirm(`Remove ${m.user.name} from this clinic?`))
                remove.mutate(m.id);
            }}
          >
            Remove
          </Button>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-xs text-destructive">
          {(error as Error).message}
        </p>
      )}
    </li>
  );
}

function InviteRow({ invite: i }: { invite: PendingInvite }) {
  const resend = useResendInvite();
  const revoke = useRevokeInvite();
  const [copied, setCopied] = useState<string | null>(null);
  const busy = resend.isPending || revoke.isPending;

  return (
    <li className="p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">{i.email}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {labelRole(i.role)} · invited by {i.invitedBy.name} · expires{' '}
            {new Date(i.expiresAt).toLocaleDateString()}
          </p>
          {copied && (
            <p className="mt-1 break-all text-xs text-emerald-700">
              Link copied: {copied}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              const res = await resend.mutateAsync(i.id);
              try {
                await navigator.clipboard.writeText(res.inviteUrl);
              } catch {
                // clipboard unavailable — the link is still shown below
              }
              setCopied(res.inviteUrl);
            }}
          >
            <Copy className="mr-1 h-3.5 w-3.5" aria-hidden /> Resend + copy link
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => revoke.mutate(i.id)}
          >
            Revoke
          </Button>
        </div>
      </div>
      {(resend.error ?? revoke.error) && (
        <p className="mt-2 text-xs text-destructive">
          {((resend.error ?? revoke.error) as Error).message}
        </p>
      )}
    </li>
  );
}

const inviteSchema = z.object({
  email: z.string().email('enter a valid email'),
  role: z.enum(['OWNER', 'ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST']),
});
type InviteInput = z.infer<typeof inviteSchema>;

function InviteDialog({ isOwner }: { isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ email: string; url: string } | null>(
    null,
  );
  const create = useCreateInvite();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'DOCTOR' },
  });
  const roleOptions = isOwner
    ? STAFF_ROLES
    : STAFF_ROLES.filter((r) => r !== 'OWNER');

  const onSubmit = handleSubmit(async (values) => {
    const created = await create.mutateAsync(values);
    setResult({ email: created.email, url: created.inviteUrl });
    reset({ email: '', role: 'DOCTOR' });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setResult(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Invite staff</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            They get an email with a link that works for 7 days. The link is
            also shown here so you can paste it into Viber if mail is slow.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <p>
              Invite sent to <span className="font-medium">{result.email}</span>
              .
            </p>
            <div className="rounded-md border bg-muted/30 p-2">
              <p className="break-all font-mono text-xs">{result.url}</p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(result.url);
                  } catch {
                    // clipboard unavailable — link is visible above
                  }
                }}
              >
                <Copy className="mr-1 h-3.5 w-3.5" aria-hidden /> Copy link
              </Button>
              <Button onClick={() => setResult(null)}>Invite another</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField label="Email" error={errors.email?.message}>
              <Input
                type="email"
                autoComplete="off"
                placeholder="doctor@clinic.ph"
                {...register('email')}
              />
            </FormField>
            <FormField label="Role" error={errors.role?.message}>
              <Select {...register('role')}>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {labelRole(r)}
                  </option>
                ))}
              </Select>
            </FormField>
            {create.error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{(create.error as Error).message}</span>
              </div>
            )}
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Sending…' : 'Send invite'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
