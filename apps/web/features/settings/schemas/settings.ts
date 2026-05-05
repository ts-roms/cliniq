import { z } from 'zod';

export const operatingHourSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  open: z.string().regex(/^\d{2}:\d{2}$/, 'HH:mm 24h'),
  close: z.string().regex(/^\d{2}:\d{2}$/, 'HH:mm 24h'),
  closed: z.boolean().default(false),
});

export const brandingSchema = z.object({
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'CSS hex e.g. #1f6feb')
    .optional()
    .or(z.literal('')),
  logoUrl: z.string().max(500).optional().or(z.literal('')),
  tagline: z.string().max(120).optional(),
});

export const settingsSchema = z.object({
  branding: brandingSchema.optional(),
  operatingHours: z.array(operatingHourSchema).optional(),
  acceptedPaymentMethods: z.array(z.string()).optional(),
  defaultInvoiceNotes: z.string().max(500).optional(),
  vatPercent: z.coerce.number().int().min(0).max(40).optional(),
  appointmentWebhookUrl: z.string().max(500).optional().or(z.literal('')),
});
export type SettingsInput = z.input<typeof settingsSchema>;
export type SettingsOutput = z.output<typeof settingsSchema>;

export interface TenantSettings {
  id: string;
  slug: string;
  name: string;
  country: string;
  timezone: string;
  currency: string;
  plan: string;
  settings: {
    branding?: {
      primaryColor?: string;
      logoUrl?: string;
      tagline?: string;
    };
    operatingHours?: Array<{
      weekday: number;
      open: string;
      close: string;
      closed?: boolean;
    }>;
    acceptedPaymentMethods?: string[];
    defaultInvoiceNotes?: string;
    vatPercent?: number;
    appointmentWebhookUrl?: string;
    extras?: Record<string, unknown>;
  } | null;
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const PAYMENT_METHODS = [
  'CASH',
  'GCASH',
  'MAYA',
  'BANK_TRANSFER',
  'CARD',
  'HMO',
  'INSURANCE',
  'OTHER',
] as const;
