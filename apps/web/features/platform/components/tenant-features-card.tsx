'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@org/ui';
import { Check, X } from 'lucide-react';
import type { TenantDetail } from '../lib/api';

interface Props {
  tenant: TenantDetail;
}

// Mirrored from libs/shared-types/src/lib/features.ts so we don't hop the lib.
// Order is the user-facing reading order.
const ALL_FEATURES = [
  { id: 'core_emr', label: 'Core EMR' },
  { id: 'reports_basic', label: 'Reports (basic)' },
  { id: 'reports_advanced', label: 'Reports (advanced)' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'labs', label: 'Labs' },
  { id: 'hmo', label: 'HMO claims' },
  { id: 'telemedicine', label: 'Telemedicine' },
  { id: 'ai_soap', label: 'AI: SOAP drafts' },
  { id: 'ai_dermatology', label: 'AI: Dermatology' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'calendar_sync', label: 'Calendar sync' },
  { id: 'custom_retention', label: 'Custom data retention' },
];

export function TenantFeaturesCard({ tenant }: Props) {
  const enabled = new Set(tenant.planMeta.features);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {tenant.planMeta.label} plan — what's included
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">{tenant.planMeta.tagline}</p>
        <ul className="space-y-1.5 text-sm">
          {ALL_FEATURES.map((f) => {
            const on = enabled.has(f.id);
            return (
              <li key={f.id} className="flex items-center gap-2">
                {on ? (
                  <Check className="h-4 w-4 text-emerald-500" aria-hidden />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground/40" aria-hidden />
                )}
                <span className={on ? '' : 'text-muted-foreground/60'}>{f.label}</span>
              </li>
            );
          })}
        </ul>
        <p className="pt-2 text-xs text-muted-foreground">
          Max locations:{' '}
          <span className="font-medium text-foreground">
            {Number.isFinite(tenant.planMeta.maxLocations)
              ? tenant.planMeta.maxLocations
              : 'Unlimited'}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
