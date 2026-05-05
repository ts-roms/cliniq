import { z } from 'zod';

export const prescriptionItemSchema = z.object({
  drugName: z.string().min(2).max(80),
  strength: z.string().max(40).optional(),
  form: z.string().max(20).optional(),
  dose: z.string().min(1).max(40),
  frequency: z.string().min(1).max(40),
  durationDays: z.coerce.number().int().min(1).optional(),
  quantity: z.string().max(40).optional(),
  instructions: z.string().max(200).optional(),
  refills: z.coerce.number().int().min(0).default(0),
});

export const createPrescriptionSchema = z.object({
  patientId: z.string().min(1),
  consultationId: z.string().min(1).optional(),
  notes: z.string().max(500).optional(),
  items: z.array(prescriptionItemSchema).min(1),
  knownAllergies: z.array(z.string()).optional(),
  currentMedications: z.array(z.string()).optional(),
  override: z.boolean().optional(),
});

// Use z.input for form values (pre-coercion) and z.output for the result that
// hits the api. react-hook-form needs the input type so its registers match
// raw <input> values (strings for number fields).
export type CreatePrescriptionFormInput = z.input<typeof createPrescriptionSchema>;
export type CreatePrescriptionInput = z.output<typeof createPrescriptionSchema>;
export type PrescriptionItemInput = z.output<typeof prescriptionItemSchema>;

export interface PrescriptionItem extends PrescriptionItemInput {
  id: string;
  prescriptionId: string;
}

export interface Prescription {
  id: string;
  number: string;
  patientId: string;
  providerId: string;
  consultationId: string | null;
  status: 'ISSUED' | 'DISPENSED' | 'CANCELLED';
  issuedAt: string;
  notes: string | null;
  items: PrescriptionItem[];
}

export type InteractionSeverity = 'low' | 'medium' | 'high' | 'urgent';

export interface InteractionFinding {
  kind: 'interaction' | 'allergy';
  severity: InteractionSeverity;
  message: string;
  drugs: string[];
}
