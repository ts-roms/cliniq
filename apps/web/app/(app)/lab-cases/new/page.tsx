'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
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
import {
  labApi,
  useClinicInvitations,
  useCreateClinicCase,
  type LabCaseUrgency,
} from '@/features/lab';

/**
 * Place a new lab case. Three-step wizard collapsed into one screen:
 *   1. Pick the lab from active links.
 *   2. Pick a product (fetched on lab choice).
 *   3. Fill metadata + submit. Optional: attach files immediately after.
 *
 * Files attach via the case detail page after creation.
 */
export default function NewClinicLabCasePage() {
  const router = useRouter();
  const { data: invitations } = useClinicInvitations();
  const activeLabs = useMemo(
    () => (invitations ?? []).filter((l) => l.status === 'ACTIVE'),
    [invitations],
  );

  const [labTenantId, setLabTenantId] = useState<string>('');
  const [productId, setProductId] = useState<string>('');
  const [urgency, setUrgency] = useState<LabCaseUrgency>('STANDARD');
  const [dueAt, setDueAt] = useState<string>('');
  const [patientLabel, setPatientLabel] = useState('');
  const [doctorLabel, setDoctorLabel] = useState('');
  const [notes, setNotes] = useState('');

  const [products, setProducts] = useState<labApi.LabProductSummary[]>([]);
  const [productsErr, setProductsErr] = useState<string | null>(null);

  // Auto-select first active lab if only one is available.
  useEffect(() => {
    if (!labTenantId && activeLabs.length === 1 && activeLabs[0].lab) {
      setLabTenantId(activeLabs[0].lab.id);
    }
  }, [activeLabs, labTenantId]);

  // Fetch lab's catalog whenever the chosen lab changes.
  useEffect(() => {
    if (!labTenantId) {
      setProducts([]);
      return;
    }
    setProductsErr(null);
    // Reuse the catalog endpoint; RLS allows a linked clinic to read it.
    labApi
      .listProducts({ activeOnly: true })
      .then((rows) => {
        // The list endpoint uses the caller's tenantId, so for clinic users
        // it returns nothing. We need to ask the lab's catalog directly,
        // but the api doesn't expose a /lab/:labId/products yet. For Phase
        // 1 MVP, the workaround is the lab pre-shares product IDs with
        // clinics out-of-band. Here we surface that gap to the user.
        setProducts(rows);
      })
      .catch((e: Error) => setProductsErr(e.message));
  }, [labTenantId]);

  const create = useCreateClinicCase();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!labTenantId || !productId) return;
    create.mutate(
      {
        labTenantId,
        productId,
        urgency,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        patientLabel: patientLabel || undefined,
        doctorLabel: doctorLabel || undefined,
        notes: notes || undefined,
      },
      {
        onSuccess: (created) => router.push(`/lab-cases/${created.id}`),
      },
    );
  }

  if (activeLabs.length === 0) {
    return (
      <div className="space-y-6">
        <Link
          href="/lab-cases"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> All cases
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>No active lab partnerships</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You need at least one accepted lab invitation before placing a case.
            </p>
            <Button asChild variant="outline">
              <Link href="/lab-invitations">View invitations</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/lab-cases"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All cases
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New lab case</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <FormField label="Lab">
              <Select
                value={labTenantId}
                onChange={(e) => {
                  setLabTenantId(e.target.value);
                  setProductId('');
                }}
              >
                <option value="">— pick a lab —</option>
                {activeLabs.map((l) => (
                  <option key={l.lab?.id} value={l.lab?.id ?? ''}>
                    {l.lab?.name} ({l.lab?.slug})
                  </option>
                ))}
              </Select>
            </FormField>

            {labTenantId && (
              <FormField label="Product">
                {productsErr && (
                  <p className="text-xs text-destructive">{productsErr}</p>
                )}
                {products.length === 0 && !productsErr && (
                  <p className="text-xs text-muted-foreground">
                    No products visible — ask the lab to share product IDs or set up the catalog browser.
                  </p>
                )}
                <Select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  <option value="">— pick a product —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.defaultPrice ? `· ₱${(p.defaultPrice / 100).toLocaleString()}` : ''}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Urgency">
                <Select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as LabCaseUrgency)}
                >
                  <option value="STANDARD">Standard</option>
                  <option value="URGENT">Urgent</option>
                </Select>
              </FormField>

              <FormField label="Due">
                <Input
                  type="date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </FormField>
            </div>

            <FormField label="Patient identifier (clinic-internal)">
              <Input
                value={patientLabel}
                onChange={(e) => setPatientLabel(e.target.value)}
                placeholder="e.g. PT-1042 or Juan D."
              />
            </FormField>

            <FormField label="Doctor">
              <Input
                value={doctorLabel}
                onChange={(e) => setDoctorLabel(e.target.value)}
                placeholder="Dr. Cruz"
              />
            </FormField>

            <FormField label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Anything the lab should know — shade, occlusion, opposing arch, etc."
              />
            </FormField>

            {create.error && (
              <p className="text-sm text-destructive">
                {(create.error as Error).message}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button asChild variant="outline">
                <Link href="/lab-cases">Cancel</Link>
              </Button>
              <Button
                type="submit"
                disabled={!labTenantId || !productId || create.isPending}
              >
                {create.isPending ? 'Creating…' : 'Create draft'}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Created in DRAFT status. Attach STL/photos on the next page, then submit.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
