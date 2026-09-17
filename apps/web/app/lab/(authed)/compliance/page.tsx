'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
  useConformityTemplates,
  useConsentTemplates,
  useCreateConformityTemplate,
  useCreateConsentTemplate,
  useDeleteConformityTemplate,
  useDeleteConsentTemplate,
} from '@/features/lab';

const PLACEHOLDER_HELP = 'Use {{caseRef}}, {{patient}}, {{doctor}}, {{lotNumbers}}, {{labName}}, {{date}} as placeholders.';

export default function LabCompliancePage() {
  const [tab, setTab] = useState<'conformity' | 'consent'>('conformity');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Compliance</h1>
        <p className="text-sm text-muted-foreground">
          Customizable templates for conformity declarations and patient consent.
          Generated when a case ships (conformity) or signed at clinic intake (consent).
        </p>
      </div>

      <div className="flex gap-2">
        <TabBtn active={tab === 'conformity'} onClick={() => setTab('conformity')}>
          Conformity
        </TabBtn>
        <TabBtn active={tab === 'consent'} onClick={() => setTab('consent')}>
          Consent
        </TabBtn>
      </div>

      {tab === 'conformity' ? <ConformitySection /> : <ConsentSection />}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-md px-4 py-1.5 text-sm font-medium transition ' +
        (active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'border border-border/60 text-muted-foreground hover:bg-muted/50')
      }
    >
      {children}
    </button>
  );
}

function ConformitySection() {
  const { data, isLoading, error } = useConformityTemplates();
  const create = useCreateConformityTemplate();
  const remove = useDeleteConformityTemplate();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;
    create.mutate(
      { name, body },
      {
        onSuccess: () => {
          setName('');
          setBody('');
          setShowForm(false);
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden /> {showForm ? 'Cancel' : 'New conformity template'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New conformity template</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <FormField label="Name">
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ISO 13485 conformity declaration"
                />
              </FormField>
              <FormField label="Body (markdown)">
                <textarea
                  required
                  rows={10}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  placeholder={`# Declaration of Conformity\n\nLab: {{labName}}\nDate: {{date}}\nCase: {{caseRef}}\nPatient: {{patient}}\n\nWe hereby declare that the dental device manufactured under case {{caseRef}} complies with applicable regulatory requirements...`}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">{PLACEHOLDER_HELP}</p>
              </FormField>
              {create.error && (
                <p className="text-sm text-destructive">
                  {(create.error as Error).message}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? 'Creating…' : 'Create'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          )}
          {data && data.length === 0 && (
            <p className="text-sm text-muted-foreground">No conformity templates yet.</p>
          )}
          <ul className="divide-y">
            {data?.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.name}</div>
                  <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted/30 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                    {t.body.slice(0, 400)}
                    {t.body.length > 400 ? '…' : ''}
                  </pre>
                </div>
                <button
                  type="button"
                  onClick={() => remove.mutate(t.id)}
                  className="text-muted-foreground/60 hover:text-destructive"
                  aria-label={`Delete ${t.name}`}
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

function ConsentSection() {
  const { data, isLoading, error } = useConsentTemplates('lab');
  const create = useCreateConsentTemplate();
  const remove = useDeleteConsentTemplate();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;
    create.mutate(
      { name, body },
      {
        onSuccess: () => {
          setName('');
          setBody('');
          setShowForm(false);
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden /> {showForm ? 'Cancel' : 'New consent template'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New consent template</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <FormField label="Name">
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Patient consent — implant work"
                />
              </FormField>
              <FormField label="Body (markdown)">
                <textarea
                  required
                  rows={10}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  placeholder={`# Patient Consent\n\nI, {{patient}}, authorize {{labName}} to manufacture the dental device described in case {{caseRef}}...`}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">{PLACEHOLDER_HELP}</p>
              </FormField>
              {create.error && (
                <p className="text-sm text-destructive">
                  {(create.error as Error).message}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? 'Creating…' : 'Create'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          )}
          {data && data.length === 0 && (
            <p className="text-sm text-muted-foreground">No consent templates yet.</p>
          )}
          <ul className="divide-y">
            {data?.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.name}</div>
                  <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted/30 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                    {t.body.slice(0, 400)}
                    {t.body.length > 400 ? '…' : ''}
                  </pre>
                </div>
                <button
                  type="button"
                  onClick={() => remove.mutate(t.id)}
                  className="text-muted-foreground/60 hover:text-destructive"
                  aria-label={`Delete ${t.name}`}
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
