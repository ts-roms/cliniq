'use client';

import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
} from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import { useBroadcast } from '../hooks/use-broadcast';

const ROLES = ['OWNER', 'ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'] as const;
type Role = (typeof ROLES)[number];

export function BroadcastForm() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState<'INFO' | 'WARNING' | 'CRITICAL'>('INFO');
  const [roles, setRoles] = useState<Set<Role>>(new Set());
  const [link, setLink] = useState('');
  const [sentNote, setSentNote] = useState<string | null>(null);
  const broadcast = useBroadcast();

  const toggleRole = (r: Role) => {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const result = await broadcast.mutateAsync({
      title: title.trim(),
      body: body.trim() || undefined,
      severity,
      roles: roles.size > 0 ? Array.from(roles) : undefined,
      link: link.trim() || undefined,
    });
    const reached = (result as { roles?: string[] }).roles ?? [];
    setSentNote(`Sent to ${reached.join(', ') || 'all staff'}`);
    setTitle('');
    setBody('');
    setLink('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Broadcast a notification</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <FormField label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Clinic closed Friday"
              maxLength={120}
              required
            />
          </FormField>
          <FormField label="Body (optional)">
            <Input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Details for the team"
              maxLength={500}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Severity">
              <Select
                value={severity}
                onChange={(e) =>
                  setSeverity(e.target.value as 'INFO' | 'WARNING' | 'CRITICAL')
                }
              >
                <option value="INFO">Info</option>
                <option value="WARNING">Warning</option>
                <option value="CRITICAL">Critical</option>
              </Select>
            </FormField>
            <FormField label="Link (optional)">
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="/admin/settings"
                maxLength={200}
              />
            </FormField>
          </div>
          <FormField label="Recipients">
            <div className="flex flex-wrap gap-1">
              {ROLES.map((r) => {
                const on = roles.has(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    className={`rounded-full px-3 py-1 text-xs ${
                      on
                        ? 'bg-primary text-primary-foreground'
                        : 'border bg-card text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {roles.size === 0 ? 'Reaches all staff (default)' : `Reaches ${roles.size} role(s)`}
            </p>
          </FormField>
          {broadcast.error && (
            <p className="text-sm text-destructive">{(broadcast.error as Error).message}</p>
          )}
          {sentNote && !broadcast.error && (
            <p className="text-sm text-emerald-700">{sentNote}</p>
          )}
          <Button type="submit" disabled={!title.trim() || broadcast.isPending}>
            {broadcast.isPending ? 'Sending…' : 'Send broadcast'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
