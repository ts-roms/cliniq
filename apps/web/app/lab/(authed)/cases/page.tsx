'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
} from '@org/ui';
import {
  CaseStatusPill,
  useLabCases,
  useLabTags,
  type LabCaseStatus,
} from '@/features/lab';

const STATUSES: LabCaseStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'IN_PROGRESS',
  'AWAITING_PICKUP',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REJECTED',
];

export default function LabCasesInboxPage() {
  const [status, setStatus] = useState<LabCaseStatus | 'all'>('all');
  const [tagId, setTagId] = useState<string>('');
  const { data, isLoading, error } = useLabCases({
    status: status === 'all' ? undefined : status,
    tagId: tagId || undefined,
  });
  const { data: tags } = useLabTags();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Case inbox</h1>
        <p className="text-sm text-muted-foreground">
          Cases received from your associated clinics.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>Cases</span>
            <div className="flex gap-2">
              {tags && tags.length > 0 && (
                <Select
                  value={tagId}
                  onChange={(e) => setTagId(e.target.value)}
                  className="w-44"
                >
                  <option value="">All tags</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as LabCaseStatus | 'all')}
                className="w-44"
              >
                <option value="all">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          )}
          {!isLoading && data && data.length === 0 && (
            <p className="text-sm text-muted-foreground">No cases match this filter.</p>
          )}

          {data && data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Ref</th>
                    <th className="py-2 pr-3">Clinic</th>
                    <th className="py-2 pr-3">Product</th>
                    <th className="py-2 pr-3">Patient</th>
                    <th className="py-2 pr-3">Tags</th>
                    <th className="py-2 pr-3">Urgency</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Files</th>
                    <th className="py-2 pr-3">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 pr-3 font-mono text-xs">
                        <Link
                          href={`/lab/cases/${c.id}`}
                          className="text-primary hover:underline"
                        >
                          #{c.refNumber ?? '—'}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">{c.clinic?.name ?? '—'}</td>
                      <td className="py-2 pr-3">{c.product?.name ?? '—'}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {c.patientLabel ?? '—'}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {(c.tagAssignments ?? []).map((a) => (
                            <span
                              key={a.tagId}
                              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{
                                backgroundColor: `#${a.tag.color}20`,
                                color: `#${a.tag.color}`,
                              }}
                            >
                              {a.tag.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-xs uppercase tracking-wider">
                        {c.urgency === 'URGENT' ? (
                          <span className="font-semibold text-amber-600 dark:text-amber-400">
                            URGENT
                          </span>
                        ) : (
                          <span className="text-muted-foreground">standard</span>
                        )}
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
