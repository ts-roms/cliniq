'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
} from '@org/ui';
import { useTenants } from '../hooks/use-tenants';
import type { TenantPlan, TenantStatus } from '../lib/api';

const STATUSES: TenantStatus[] = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'];
const PLANS: TenantPlan[] = ['STARTER', 'PRO', 'PREMIUM'];

const STATUS_COLOR: Record<TenantStatus, string> = {
  TRIAL: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  PAST_DUE: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  SUSPENDED: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  CANCELLED: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

const PLAN_COLOR: Record<TenantPlan, string> = {
  STARTER: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  PRO: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  PREMIUM: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
};

export function TenantsTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TenantStatus | 'all'>('all');
  const [plan, setPlan] = useState<TenantPlan | 'all'>('all');

  const { data, isLoading, error } = useTenants({
    search: search || undefined,
    status: status === 'all' ? undefined : status,
    plan: plan === 'all' ? undefined : plan,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tenants</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search by slug or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as TenantStatus | 'all')}
            className="w-40"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select
            value={plan}
            onChange={(e) => setPlan(e.target.value as TenantPlan | 'all')}
            className="w-40"
          >
            <option value="all">All plans</option>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>

        {error && (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Tenant</th>
                <th className="py-2 pr-3">Plan</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Users</th>
                <th className="py-2 pr-3">Locations</th>
                <th className="py-2 pr-3">Patients</th>
                <th className="py-2 pr-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && data?.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">
                    No tenants match those filters.
                  </td>
                </tr>
              )}
              {data?.items.map((t) => (
                <tr key={t.id} className="border-b hover:bg-muted/30">
                  <td className="py-2 pr-3">
                    <Link
                      href={`/platform/tenants/${t.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {t.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{t.slug}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${PLAN_COLOR[t.plan]}`}
                    >
                      {t.plan}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[t.status]}`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{t.userCount}</td>
                  <td className="py-2 pr-3 tabular-nums">{t.locationCount}</td>
                  <td className="py-2 pr-3 tabular-nums">{t.patientCount}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
