import { z } from 'zod';

export const labOrderStatusEnum = z.enum([
  'PENDING',
  'COLLECTED',
  'RECEIVED',
  'REPORTED',
  'CANCELLED',
]);
export type LabOrderStatus = z.infer<typeof labOrderStatusEnum>;

export const labAbnormalFlagEnum = z.enum([
  'NORMAL',
  'HIGH',
  'LOW',
  'CRITICAL_HIGH',
  'CRITICAL_LOW',
  'ABNORMAL',
]);
export type LabAbnormalFlag = z.infer<typeof labAbnormalFlagEnum>;

const labOrderItemInput = z.object({
  testCode: z.string().max(40).optional(),
  testName: z.string().min(1).max(120),
  category: z.string().max(40).optional(),
  resultUnit: z.string().max(20).optional(),
  referenceLow: z.coerce.number().optional(),
  referenceHigh: z.coerce.number().optional(),
});

export const createOrderSchema = z.object({
  patientId: z.string().min(1),
  consultationId: z.string().optional(),
  vendor: z.string().max(120).optional(),
  externalRef: z.string().max(80).optional(),
  notes: z.string().max(280).optional(),
  items: z.array(labOrderItemInput).min(1, 'add at least one test'),
});
export type CreateOrderInput = z.input<typeof createOrderSchema>;
export type CreateOrderOutput = z.output<typeof createOrderSchema>;

export const recordResultSchema = z.object({
  resultValue: z.string().min(1, 'enter a value'),
  resultUnit: z.string().max(20).optional(),
  abnormalFlag: labAbnormalFlagEnum.optional(),
  comment: z.string().max(280).optional(),
});
export type RecordResultInput = z.infer<typeof recordResultSchema>;

export interface LabOrderItem {
  id: string;
  testCode: string | null;
  testName: string;
  category: string | null;
  resultValue: string | null;
  resultUnit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  abnormalFlag: LabAbnormalFlag | null;
  comment: string | null;
  reportedAt: string | null;
}

export interface LabOrder {
  id: string;
  number: string;
  patientId: string;
  consultationId: string | null;
  providerId: string;
  status: LabOrderStatus;
  vendor: string | null;
  externalRef: string | null;
  notes: string | null;
  collectedAt: string | null;
  receivedAt: string | null;
  reportedAt: string | null;
  createdAt: string;
  items: LabOrderItem[];
}

// Common test presets — let the doctor pick from a menu instead of typing
// every panel from scratch. Reference ranges follow PH common-lab norms but
// vary by lab — they're a starting point, editable per row.
export const TEST_PRESETS: Array<{
  category: string;
  tests: Array<Pick<LabOrderItem, 'testCode' | 'testName' | 'resultUnit'> & {
    referenceLow?: number;
    referenceHigh?: number;
  }>;
}> = [
  {
    category: 'CBC',
    tests: [
      { testCode: 'HGB', testName: 'Hemoglobin', resultUnit: 'g/dL', referenceLow: 12, referenceHigh: 17 },
      { testCode: 'WBC', testName: 'WBC count', resultUnit: '×10⁹/L', referenceLow: 4, referenceHigh: 11 },
      { testCode: 'PLT', testName: 'Platelet count', resultUnit: '×10⁹/L', referenceLow: 150, referenceHigh: 450 },
      { testCode: 'HCT', testName: 'Hematocrit', resultUnit: '%', referenceLow: 36, referenceHigh: 50 },
    ],
  },
  {
    category: 'Chemistry',
    tests: [
      { testCode: 'FBS', testName: 'Fasting blood sugar', resultUnit: 'mg/dL', referenceLow: 70, referenceHigh: 99 },
      { testCode: 'HBA1C', testName: 'HbA1c', resultUnit: '%', referenceLow: 4, referenceHigh: 5.7 },
      { testCode: 'CHOL', testName: 'Total cholesterol', resultUnit: 'mg/dL', referenceHigh: 200 },
      { testCode: 'CREA', testName: 'Creatinine', resultUnit: 'mg/dL', referenceLow: 0.6, referenceHigh: 1.2 },
    ],
  },
  {
    category: 'Urinalysis',
    tests: [
      { testCode: 'UA-COL', testName: 'Color', resultUnit: '' },
      { testCode: 'UA-PRO', testName: 'Protein', resultUnit: '' },
      { testCode: 'UA-GLU', testName: 'Glucose', resultUnit: '' },
      { testCode: 'UA-WBC', testName: 'WBC', resultUnit: '/hpf' },
    ],
  },
];
