'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@org/ui';
import { CaseStatusPill, useClinicCases } from '@/features/lab';

export default function ClinicLabCasesPage() {
  const { data, isLoading, error } = useClinicCases();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lab cases</h1>
          <p className="text-sm text-muted-foreground">
            Cases your clinic has placed with associated labs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/lab-invoices">View invoices</Link>
          </Button>
          <Button asChild>
            <Link href="/lab-cases/new">
              <Plus className="mr-2 h-4 w-4" aria-hidden /> New case
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All cases</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          )}
          {!isLoading && data && data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No cases yet. Click <span className="font-medium">New case</span> to place one.
            </p>
          )}

          {data && data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Ref</th>
                    <th className="py-2 pr-3">Lab</th>
                    <th className="py-2 pr-3">Product</th>
                    <th className="py-2 pr-3">Patient</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Files</th>
                    <th className="py-2 pr-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 pr-3 font-mono text-xs">
                        <Link href={`/lab-cases/${c.id}`} className="text-primary hover:underline">
                          {c.refNumber ?? '—'}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">{c.lab?.name ?? '—'}</td>
                      <td className="py-2 pr-3">{c.product?.name ?? '—'}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {c.patientLabel ?? '—'}
                      </td>
                      <td className="py-2 pr-3">
                        <CaseStatusPill status={c.status} />
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{c._count?.files ?? 0}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
