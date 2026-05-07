'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@org/ui';
import {
  InvoiceStatusPill,
  useLabInvoice,
  useIssueLabInvoice,
  useUpdateLabInvoice,
  useAddLabInvoiceItem,
  useDeleteLabInvoiceItem,
  useRecordLabInvoicePayment,
  useVoidLabInvoice,
  useCreateLabPaymentLink,
  useCancelLabPaymentLink,
  useGenerateLabInvoicePdf,
} from '@/features/lab';

function formatMoney(cents: number, currency: string): string {
  const formatter = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });
  return formatter.format(cents / 100);
}

export default function LabInvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = params?.id ?? null;
  const { data: invoice, isLoading, error } = useLabInvoice(invoiceId);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error)
    return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!invoice) return null;

  const isDraft = invoice.status === 'DRAFT';
  const isIssued = invoice.status === 'ISSUED' || invoice.status === 'OVERDUE';
  const outstanding = invoice.totalCents - invoice.paidCents;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/lab/billing"
          className="flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to billing
        </Link>
        <div className="flex items-center gap-2">
          <DownloadPdfButton id={invoice.id} />
          {isDraft && <IssueButton id={invoice.id} />}
          {invoice.status !== 'PAID' && invoice.status !== 'VOID' && (
            <VoidButton
              id={invoice.id}
              onSuccess={() => router.refresh()}
            />
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-3">
              <span className="font-mono text-base">
                {invoice.refNumber !== null ? `INV-${invoice.refNumber}` : 'Draft invoice'}
              </span>
              <InvoiceStatusPill status={invoice.status} />
            </span>
            <span className="text-sm text-muted-foreground">
              {invoice.clinic?.name}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 text-sm md:grid-cols-4">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Subtotal</div>
              <div className="tabular-nums">
                {formatMoney(invoice.subtotalCents, invoice.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Tax</div>
              <div className="tabular-nums">
                {formatMoney(invoice.taxCents, invoice.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Total</div>
              <div className="text-lg font-semibold tabular-nums">
                {formatMoney(invoice.totalCents, invoice.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Outstanding</div>
              <div className="text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                {formatMoney(outstanding, invoice.currency)}
              </div>
            </div>
          </div>

          <div className="grid gap-3 text-sm md:grid-cols-3">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Issued</div>
              <div>
                {invoice.issuedAt
                  ? new Date(invoice.issuedAt).toLocaleString()
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Due</div>
              <div>
                {invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Paid</div>
              <div>
                {invoice.paidAt ? new Date(invoice.paidAt).toLocaleString() : '—'}
              </div>
            </div>
          </div>

          {invoice.notes && (
            <div>
              <div className="text-xs uppercase text-muted-foreground">Notes</div>
              <p className="whitespace-pre-wrap text-sm">{invoice.notes}</p>
            </div>
          )}

          {isDraft && <EditMetaForm invoice={invoice} />}
        </CardContent>
      </Card>

      <ItemsCard invoice={invoice} />

      {isIssued && outstanding > 0 && <RecordPaymentCard invoice={invoice} />}
      <PaymentLinksCard invoice={invoice} />
    </div>
  );
}

function IssueButton({ id }: { id: string }) {
  const issue = useIssueLabInvoice(id);
  return (
    <Button onClick={() => issue.mutate()} disabled={issue.isPending}>
      {issue.isPending ? 'Issuing…' : 'Issue invoice'}
    </Button>
  );
}

function DownloadPdfButton({ id }: { id: string }) {
  const gen = useGenerateLabInvoicePdf(id);
  function handle() {
    gen.mutate(undefined, {
      onSuccess: (res) => {
        // Open the presigned URL in a new tab. The download disposition is
        // set on the GET so browsers prompt with the friendly filename.
        window.open(res.url, '_blank', 'noopener');
      },
    });
  }
  return (
    <Button variant="outline" onClick={handle} disabled={gen.isPending}>
      {gen.isPending ? 'Rendering…' : 'Download PDF'}
    </Button>
  );
}

function VoidButton({ id, onSuccess }: { id: string; onSuccess: () => void }) {
  const voidInv = useVoidLabInvoice(id);
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button variant="outline" onClick={() => setConfirming(true)}>
        Void
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Sure?</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirming(false)}
        disabled={voidInv.isPending}
      >
        Cancel
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() =>
          voidInv.mutate(undefined, {
            onSuccess: () => {
              setConfirming(false);
              onSuccess();
            },
          })
        }
        disabled={voidInv.isPending}
      >
        {voidInv.isPending ? 'Voiding…' : 'Void invoice'}
      </Button>
    </div>
  );
}

function EditMetaForm({
  invoice,
}: {
  invoice: { id: string; dueAt: string | null; notes: string | null; taxCents: number };
}) {
  const update = useUpdateLabInvoice(invoice.id);
  const [dueAt, setDueAt] = useState(
    invoice.dueAt ? invoice.dueAt.slice(0, 10) : '',
  );
  const [notes, setNotes] = useState(invoice.notes ?? '');
  const [taxCents, setTaxCents] = useState(String(invoice.taxCents));

  function save() {
    update.mutate({
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      notes: notes || null,
      taxCents: Number(taxCents) || 0,
    });
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">
        Edit (draft only)
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Due date
          </label>
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Tax (centavos)
          </label>
          <Input
            type="number"
            min={0}
            value={taxCents}
            onChange={(e) => setTaxCents(e.target.value)}
          />
        </div>
        <div className="md:col-span-3">
          <label className="mb-1 block text-xs text-muted-foreground">Notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function ItemsCard({
  invoice,
}: {
  invoice: {
    id: string;
    status: string;
    currency: string;
    items: Array<{
      id: string;
      caseId: string | null;
      description: string;
      qty: number;
      unitPriceCents: number;
      amountCents: number;
    }>;
  };
}) {
  const isDraft = invoice.status === 'DRAFT';
  const remove = useDeleteLabInvoiceItem(invoice.id);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Line items</CardTitle>
      </CardHeader>
      <CardContent>
        {invoice.items.length === 0 && (
          <p className="text-sm text-muted-foreground">No items yet.</p>
        )}
        {invoice.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Description</th>
                  <th className="py-2 pr-3 text-right">Qty</th>
                  <th className="py-2 pr-3 text-right">Unit</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  {isDraft && <th className="py-2 pr-3"></th>}
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((it) => (
                  <tr key={it.id} className="border-b">
                    <td className="py-2 pr-3">{it.description}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{it.qty}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatMoney(it.unitPriceCents, invoice.currency)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatMoney(it.amountCents, invoice.currency)}
                    </td>
                    {isDraft && (
                      <td className="py-2 pr-3 text-right">
                        <button
                          type="button"
                          onClick={() => remove.mutate(it.id)}
                          className="text-muted-foreground/60 hover:text-destructive"
                          aria-label={`Delete ${it.description}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isDraft && <AddItemForm invoiceId={invoice.id} />}
      </CardContent>
    </Card>
  );
}

function AddItemForm({ invoiceId }: { invoiceId: string }) {
  const add = useAddLabInvoiceItem(invoiceId);
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('1');
  const [unitPriceCents, setUnitPriceCents] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !unitPriceCents) return;
    add.mutate(
      {
        description: description.trim(),
        qty: Number(qty) || 1,
        unitPriceCents: Number(unitPriceCents),
      },
      {
        onSuccess: () => {
          setDescription('');
          setQty('1');
          setUnitPriceCents('');
        },
      },
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 grid gap-3 rounded-md border bg-muted/20 p-3 md:grid-cols-[1fr,80px,140px,auto]"
    >
      <Input
        required
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Input
        type="number"
        min={1}
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        placeholder="Qty"
      />
      <Input
        required
        type="number"
        min={0}
        value={unitPriceCents}
        onChange={(e) => setUnitPriceCents(e.target.value)}
        placeholder="Unit (centavos)"
      />
      <Button type="submit" disabled={add.isPending}>
        <Plus className="mr-1 h-4 w-4" aria-hidden /> Add
      </Button>
      {add.error && (
        <p className="md:col-span-4 text-xs text-destructive">
          {(add.error as Error).message}
        </p>
      )}
    </form>
  );
}

function RecordPaymentCard({
  invoice,
}: {
  invoice: { id: string; currency: string; totalCents: number; paidCents: number };
}) {
  const record = useRecordLabInvoicePayment(invoice.id);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const outstanding = invoice.totalCents - invoice.paidCents;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = Number(amount);
    if (!cents) return;
    record.mutate(
      { amountCents: cents, reference: reference || undefined },
      {
        onSuccess: () => {
          setAmount('');
          setReference('');
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record payment</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-[200px,1fr,auto]">
          <Input
            required
            type="number"
            min={1}
            max={outstanding}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Amount (centavos, max ${outstanding})`}
          />
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Reference (bank ref, link id)"
          />
          <Button type="submit" disabled={record.isPending || !amount}>
            {record.isPending ? 'Recording…' : 'Record'}
          </Button>
          {record.error && (
            <p className="md:col-span-3 text-xs text-destructive">
              {(record.error as Error).message}
            </p>
          )}
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Outstanding: {formatMoney(outstanding, invoice.currency)}
        </p>
      </CardContent>
    </Card>
  );
}

function PaymentLinksCard({
  invoice,
}: {
  invoice: {
    id: string;
    status: string;
    currency: string;
    totalCents: number;
    paidCents: number;
    paymentLinks: Array<{
      id: string;
      provider: string;
      status: string;
      url: string | null;
      amountCents: number;
      expiresAt: string | null;
      createdAt: string;
    }>;
  };
}) {
  const create = useCreateLabPaymentLink(invoice.id);
  const cancel = useCancelLabPaymentLink(invoice.id);
  const canCreate =
    (invoice.status === 'ISSUED' || invoice.status === 'OVERDUE') &&
    invoice.totalCents - invoice.paidCents > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Payment links</span>
          {canCreate && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => create.mutate({ provider: 'PAYMONGO' })}
                disabled={create.isPending}
                title="Generate a hosted PayMongo checkout link (requires PAYMONGO_SECRET_KEY)"
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden />
                {create.isPending ? 'Creating…' : 'PayMongo link'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => create.mutate({ provider: 'MANUAL' })}
                disabled={create.isPending}
              >
                Manual link
              </Button>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {create.error && (
          <p className="mb-2 text-sm text-destructive">
            {(create.error as Error).message}
          </p>
        )}
        {invoice.paymentLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No payment links yet. PayMongo issues a hosted-checkout URL
            payable by card / GCash / Maya / GrabPay; manual links are
            placeholders for offline payment intents (bank transfer, etc.).
          </p>
        ) : (
          <ul className="divide-y">
            {invoice.paymentLinks.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">
                    {l.provider} · {formatMoney(l.amountCents, invoice.currency)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {l.status} · created {new Date(l.createdAt).toLocaleString()}
                    {l.expiresAt &&
                      ` · expires ${new Date(l.expiresAt).toLocaleString()}`}
                  </div>
                  {l.url && (
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      {l.url}
                    </a>
                  )}
                </div>
                {l.status === 'PENDING' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => cancel.mutate(l.id)}
                    disabled={cancel.isPending}
                  >
                    Cancel
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
