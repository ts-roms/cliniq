import { z } from 'zod';

export const allergyTypeEnum = z.enum(['DRUG', 'FOOD', 'ENVIRONMENT', 'OTHER']);
export const severityEnum = z.enum(['MILD', 'MODERATE', 'SEVERE']);
export const medStatusEnum = z.enum(['ACTIVE', 'COMPLETED', 'STOPPED']);
export const conditionStatusEnum = z.enum([
  'ACTIVE',
  'RESOLVED',
  'CHRONIC',
  'INACTIVE',
]);

export const createAllergySchema = z.object({
  substance: z.string().min(1).max(80),
  type: allergyTypeEnum,
  severity: severityEnum,
  reaction: z.string().max(200).optional(),
});
export type CreateAllergyInput = z.infer<typeof createAllergySchema>;

export const createMedicationSchema = z.object({
  drugName: z.string().min(1).max(80),
  dose: z.string().max(40).optional(),
  frequency: z.string().max(40).optional(),
  status: medStatusEnum.default('ACTIVE'),
  notes: z.string().max(280).optional(),
});
export type CreateMedicationInput = z.input<typeof createMedicationSchema>;
export type CreateMedicationOutput = z.output<typeof createMedicationSchema>;

export const createConditionSchema = z.object({
  name: z.string().min(1).max(120),
  icd10Code: z.string().max(20).optional(),
  status: conditionStatusEnum.default('ACTIVE'),
  notes: z.string().max(280).optional(),
});
export type CreateConditionInput = z.input<typeof createConditionSchema>;
export type CreateConditionOutput = z.output<typeof createConditionSchema>;

export const createVitalSchema = z
  .object({
    systolic: z.coerce.number().int().min(40).max(260).optional(),
    diastolic: z.coerce.number().int().min(20).max(180).optional(),
    heartRate: z.coerce.number().int().min(20).max(250).optional(),
    respRate: z.coerce.number().int().min(4).max(80).optional(),
    tempC: z.coerce.number().min(25).max(45).optional(),
    spo2: z.coerce.number().int().min(50).max(100).optional(),
    weightKg: z.coerce.number().min(0.5).max(400).optional(),
    heightCm: z.coerce.number().min(20).max(250).optional(),
    painScore: z.coerce.number().int().min(0).max(10).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'enter at least one measurement',
  });
export type CreateVitalInput = z.input<typeof createVitalSchema>;
export type CreateVitalOutput = z.output<typeof createVitalSchema>;

export interface Allergy {
  id: string;
  substance: string;
  type: z.infer<typeof allergyTypeEnum>;
  severity: z.infer<typeof severityEnum>;
  reaction: string | null;
}

export interface Medication {
  id: string;
  drugName: string;
  dose: string | null;
  frequency: string | null;
  status: z.infer<typeof medStatusEnum>;
  startedOn: string | null;
  stoppedOn: string | null;
  notes: string | null;
}

export interface Condition {
  id: string;
  name: string;
  icd10Code: string | null;
  status: z.infer<typeof conditionStatusEnum>;
  diagnosedOn: string | null;
  notes: string | null;
}

export interface Vital {
  id: string;
  recordedAt: string;
  systolic: number | null;
  diastolic: number | null;
  heartRate: number | null;
  respRate: number | null;
  tempC: number | null;
  spo2: number | null;
  weightKg: number | null;
  heightCm: number | null;
  bmi: number | null;
  painScore: number | null;
}
