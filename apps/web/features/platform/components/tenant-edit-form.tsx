'use client';

import { useState } from 'react';
import { Button, Input, Select } from '@org/ui';
import { FormField } from '@/shared/components/forms/form-field';
import { useUpdateTenant } from '../hooks/use-tenants';
import type {
  TenantDetail,
  TenantPlan,
  TenantStatus,
  UpdateTenantInput,
} from '../lib/api';

const STATUSES: TenantStatus[] = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'];
const PLANS: TenantPlan[] = ['STARTER', 'PRO', 'PREMIUM'];

interface Props {
  tenant: TenantDetail;
}

export function TenantEditForm({ tenant }: Props) {
  const [name, setName] = useState(tenant.name);
  const [plan, setPlan] = useState<TenantPlan>(tenant.plan);
  const [status, setStatus] = useState<TenantStatus>(tenant.status);
  const [trialEndsAt, setTrialEndsAt] = useState(
    tenant.trialEndsAt ? tenant.trialEndsAt.slice(0, 10) : '',
  );

  const update = useUpdateTenant(tenant.id);

  const dirty =
    name !== tenant.name ||
    plan !== tenant.plan ||
    status !== tenant.status ||
    (trialEndsAt || null) !== (tenant.trialEndsAt?.slice(0, 10) || null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const dto: UpdateTenantInput = {};
    if (name !== tenant.name) dto.name = name;
    if (plan !== tenant.plan) dto.plan = plan;
    if (status !== tenant.status) dto.status = status;
    if ((trialEndsAt || null) !== (tenant.trialEndsAt?.slice(0, 10) || null)) {
      dto.trialEndsAt = trialEndsAt ? new Date(trialEndsAt).toISOString() : null;
    }
    update.mutate(dto);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Plan">
          <Select value={plan} onChange={(e) => setPlan(e.target.value as TenantPlan)}>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">Determines unlocked features.</p>
        </FormField>

        <FormField label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as TenantStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            SUSPENDED blocks login. CANCELLED is read-only.
          </p>
        </FormField>
      </div>

      <FormField label="Trial ends">
        <Input
          type="date"
          value={trialEndsAt}
          onChange={(e) => setTrialEndsAt(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Leave blank for no trial / paid.</p>
      </FormField>

      {update.error && (
        <p role="alert" className="text-sm text-destructive">
          {(update.error as Error).message}
        </p>
      )}
      {update.isSuccess && !dirty && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={!dirty || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
