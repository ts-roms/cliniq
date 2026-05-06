'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@org/ui';
import {
  TenantEditForm,
  TenantFeaturesCard,
  useTenant,
} from '@/features/platform';

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const { data, isLoading, error } = useTenant(id);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-destructive">{(error as Error).message}</p>
    );
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Tenant not found.</p>;
  }

  const t = data;

  return (
    <div className="space-y-6">
      <Link
        href="/platform/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All tenants
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{t.name}</h1>
        <p className="text-sm text-muted-foreground">
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{t.slug}</code> ·
          {' '}
          {t.userCount} users · {t.locationCount} locations · {t.patientCount} patients ·
          {' '}
          created {new Date(t.createdAt).toLocaleDateString()}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
          </CardHeader>
          <CardContent>
            <TenantEditForm tenant={t} />
          </CardContent>
        </Card>

        <TenantFeaturesCard tenant={t} />
      </div>
    </div>
  );
}
