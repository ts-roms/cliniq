'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
  PAYMENT_METHODS,
  WEEKDAYS,
  settingsSchema,
  type SettingsInput,
  type SettingsOutput,
  type TenantSettings,
} from '../schemas/settings';
import { useUpdateSettings } from '../hooks/use-settings';

const DEFAULT_HOURS = WEEKDAYS.map((_, weekday) => ({
  weekday,
  open: '08:00',
  close: '17:00',
  closed: weekday === 0,
}));

export function SettingsForm({ tenant }: { tenant: TenantSettings }) {
  const update = useUpdateSettings();
  const settings = tenant.settings ?? {};
  const operatingHours = settings.operatingHours ?? DEFAULT_HOURS;
  const acceptedPaymentMethods = settings.acceptedPaymentMethods ?? ['CASH', 'GCASH', 'CARD'];

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SettingsInput, unknown, SettingsOutput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      branding: {
        primaryColor: settings.branding?.primaryColor ?? '',
        logoUrl: settings.branding?.logoUrl ?? '',
        tagline: settings.branding?.tagline ?? '',
      },
      defaultInvoiceNotes: settings.defaultInvoiceNotes ?? '',
      vatPercent: settings.vatPercent ?? 12,
      appointmentWebhookUrl: settings.appointmentWebhookUrl ?? '',
      operatingHours,
      acceptedPaymentMethods,
    },
  });

  useEffect(() => {
    reset({
      branding: {
        primaryColor: settings.branding?.primaryColor ?? '',
        logoUrl: settings.branding?.logoUrl ?? '',
        tagline: settings.branding?.tagline ?? '',
      },
      defaultInvoiceNotes: settings.defaultInvoiceNotes ?? '',
      vatPercent: settings.vatPercent ?? 12,
      appointmentWebhookUrl: settings.appointmentWebhookUrl ?? '',
      operatingHours,
      acceptedPaymentMethods,
    });
  }, [tenant.id]);

  const acceptedSet = new Set(watch('acceptedPaymentMethods') ?? []);
  const togglePayment = (m: string) => {
    const next = new Set(acceptedSet);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    setValue('acceptedPaymentMethods', Array.from(next), { shouldDirty: true });
  };

  const onSubmit = handleSubmit(async (values) => {
    const cleaned: SettingsOutput = {
      ...values,
      appointmentWebhookUrl: values.appointmentWebhookUrl || undefined,
      branding: values.branding && {
        primaryColor: values.branding.primaryColor || undefined,
        logoUrl: values.branding.logoUrl || undefined,
        tagline: values.branding.tagline || undefined,
      },
    };
    await update.mutateAsync(cleaned);
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Clinic profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Slug</p>
            <p className="font-mono text-sm">{tenant.slug}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Plan</p>
            <p className="text-sm">{tenant.plan}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Timezone</p>
            <p className="text-sm">{tenant.timezone}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <FormField label="Primary color (hex)" error={errors.branding?.primaryColor?.message}>
            <Input placeholder="#1f6feb" {...register('branding.primaryColor')} />
          </FormField>
          <FormField label="Logo URL" error={errors.branding?.logoUrl?.message}>
            <Input placeholder="https://…/logo.png" {...register('branding.logoUrl')} />
          </FormField>
          <FormField label="Tagline" error={errors.branding?.tagline?.message}>
            <Input placeholder="Care, on time" {...register('branding.tagline')} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Operating hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {WEEKDAYS.map((label, idx) => (
            <div key={idx} className="grid grid-cols-12 items-center gap-2">
              <label className="col-span-2 text-sm font-medium">{label}</label>
              <div className="col-span-2">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    {...register(`operatingHours.${idx}.closed`)}
                  />
                  closed
                </label>
              </div>
              <div className="col-span-3">
                <Input type="time" {...register(`operatingHours.${idx}.open`)} />
              </div>
              <div className="col-span-3">
                <Input type="time" {...register(`operatingHours.${idx}.close`)} />
              </div>
              <input type="hidden" value={idx} {...register(`operatingHours.${idx}.weekday`)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label="Accepted payment methods">
            <div className="flex flex-wrap gap-1">
              {PAYMENT_METHODS.map((m) => {
                const on = acceptedSet.has(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => togglePayment(m)}
                    className={`rounded-full px-3 py-1 text-xs ${
                      on
                        ? 'bg-primary text-primary-foreground'
                        : 'border bg-card text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {m.replace('_', ' ')}
                  </button>
                );
              })}
            </div>
          </FormField>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="VAT % (PH typical: 12)" error={errors.vatPercent?.message}>
              <Input type="number" {...register('vatPercent')} />
            </FormField>
            <FormField label="Default invoice notes" error={errors.defaultInvoiceNotes?.message}>
              <Input placeholder="Thank you. Payment due upon receipt." {...register('defaultInvoiceNotes')} />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FormField
            label="Appointment webhook URL"
            error={errors.appointmentWebhookUrl?.message}
          >
            <Input
              placeholder="https://hooks.zapier.com/hooks/catch/…"
              {...register('appointmentWebhookUrl')}
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            POST events fire on appointment create / check-in / cancel. Pipe through
            Zapier, Make, or n8n to push into Google or Microsoft Calendar. Each
            request is signed with the <code>X-ClinIQ-Signature</code> header
            (HMAC-SHA256 over the JSON body) — verify on the receiving end.
          </p>
        </CardContent>
      </Card>

      {update.error && (
        <p className="text-sm text-destructive">{(update.error as Error).message}</p>
      )}
      <div className="sticky bottom-4 flex justify-end gap-2 rounded-lg border bg-card p-3 shadow-sm">
        <Button type="submit" disabled={isSubmitting || update.isPending || !isDirty}>
          {update.isPending ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </form>
  );
}
