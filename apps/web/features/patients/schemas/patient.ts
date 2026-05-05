import { z } from 'zod';

export const sexEnum = z.enum(['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED']);
export type Sex = z.infer<typeof sexEnum>;

export const createPatientSchema = z.object({
  mrn: z
    .string()
    .regex(/^[A-Za-z0-9-]+$/, 'letters, digits, hyphens only')
    .max(40),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  dateOfBirth: z.string().min(1, 'required'),
  sex: sexEnum,
  email: z.string().email().or(z.literal('')).optional(),
  phone: z.string().max(20).optional(),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;

export const updatePatientSchema = createPatientSchema.partial();
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;

export interface Patient {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: Sex;
  email: string | null;
  phone: string | null;
}

export interface PatientListResult {
  items: Patient[];
  total: number;
  limit: number;
  cursor: number;
  nextCursor: number | null;
}
