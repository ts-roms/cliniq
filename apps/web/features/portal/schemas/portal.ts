import { z } from 'zod';

export const patientLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type PatientLoginInput = z.infer<typeof patientLoginSchema>;

export const patientSignupSchema = z.object({
  tenantSlug: z.string().min(3),
  mrn: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, 'letters, digits, hyphens only'),
  email: z.string().email(),
  password: z.string().min(8, 'minimum 8 characters'),
});
export type PatientSignupInput = z.infer<typeof patientSignupSchema>;

export interface MeProfile {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: string;
  email: string | null;
  phone: string | null;
}

export interface MeAppointment {
  id: string;
  startsAt: string;
  endsAt: string;
  type: string;
  status: string;
  reason: string | null;
}

export interface MeInvoiceItem {
  description: string;
  quantity: number;
  unitPriceCentavos: number;
  totalCentavos: number;
}

export interface MePayment {
  amountCentavos: number;
  method: string;
  paidAt: string;
}

export interface MeInvoice {
  id: string;
  number: string;
  status: string;
  totalCentavos: number;
  paidCentavos: number;
  issuedAt: string;
  items: MeInvoiceItem[];
  payments: MePayment[];
}

export interface MeRecords {
  allergies: Array<{ id: string; substance: string; severity: string; reaction: string | null }>;
  medications: Array<{
    id: string;
    drugName: string;
    dose: string | null;
    frequency: string | null;
    status: string;
  }>;
  conditions: Array<{
    id: string;
    name: string;
    icd10Code: string | null;
    status: string;
  }>;
  vitals: Array<{
    id: string;
    recordedAt: string;
    systolic: number | null;
    diastolic: number | null;
    heartRate: number | null;
    spo2: number | null;
    bmi: number | null;
  }>;
  prescriptions: Array<{
    id: string;
    number: string;
    issuedAt: string;
    status: string;
    items: Array<{ drugName: string; dose: string | null; frequency: string | null }>;
  }>;
  labOrders: Array<{
    id: string;
    number: string;
    status: string;
    vendor: string | null;
    createdAt: string;
    reportedAt: string | null;
    items: Array<{
      id: string;
      testName: string;
      resultValue: string | null;
      resultUnit: string | null;
      referenceLow: number | null;
      referenceHigh: number | null;
      abnormalFlag:
        | 'NORMAL'
        | 'HIGH'
        | 'LOW'
        | 'CRITICAL_HIGH'
        | 'CRITICAL_LOW'
        | 'ABNORMAL'
        | null;
    }>;
  }>;
}
