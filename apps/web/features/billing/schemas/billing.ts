import { z } from 'zod';

export const paymentMethodEnum = z.enum([
  'CASH',
  'GCASH',
  'MAYA',
  'BANK_TRANSFER',
  'CARD',
  'HMO',
  'INSURANCE',
  'OTHER',
]);
export type PaymentMethod = z.infer<typeof paymentMethodEnum>;

export const invoiceStatusEnum = z.enum([
  'DRAFT',
  'SENT',
  'PARTIAL',
  'PAID',
  'OVERDUE',
  'CANCELLED',
]);
export type InvoiceStatus = z.infer<typeof invoiceStatusEnum>;

export const invoiceItemSchema = z.object({
  description: z.string().min(1).max(200),
  quantity: z.coerce.number().int().min(1),
  unitPriceCentavos: z.coerce.number().int().min(0),
  serviceId: z.string().optional(),
});
export type InvoiceItemInput = z.input<typeof invoiceItemSchema>;
export type InvoiceItemOutput = z.output<typeof invoiceItemSchema>;

export const createInvoiceSchema = z.object({
  patientId: z.string().min(1),
  discountCentavos: z.coerce.number().int().min(0).optional(),
  taxCentavos: z.coerce.number().int().min(0).optional(),
  notes: z.string().max(280).optional(),
  items: z.array(invoiceItemSchema).min(1, 'add at least one line'),
});
export type CreateInvoiceInput = z.input<typeof createInvoiceSchema>;
export type CreateInvoiceOutput = z.output<typeof createInvoiceSchema>;

export const recordPaymentSchema = z.object({
  amountCentavos: z.coerce.number().int().min(1),
  method: paymentMethodEnum,
  reference: z.string().max(80).optional(),
});
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;
export type RecordPaymentOutput = z.output<typeof recordPaymentSchema>;

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPriceCentavos: number;
  totalCentavos: number;
  serviceId: string | null;
}

export interface Payment {
  id: string;
  amountCentavos: number;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
}

export interface Invoice {
  id: string;
  number: string;
  patientId: string;
  status: InvoiceStatus;
  subtotalCentavos: number;
  discountCentavos: number;
  taxCentavos: number;
  totalCentavos: number;
  paidCentavos: number;
  /** ISO 4217 code, e.g. "PHP". Defaults to PHP when absent. */
  currency?: string;
  notes: string | null;
  createdAt: string;
  items: InvoiceItem[];
  payments: Payment[];
}
