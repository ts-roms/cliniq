import { z } from 'zod';

export const dentitionEnum = z.enum(['ADULT', 'DECIDUOUS', 'MIXED']);
export type Dentition = z.infer<typeof dentitionEnum>;

export const toothStatusEnum = z.enum([
  'PRESENT',
  'MISSING',
  'EXTRACTED',
  'IMPLANT',
  'CROWNED',
  'ROOT_CANAL',
  'EXTRACTION_NEEDED',
  'UNERUPTED',
]);
export type ToothStatus = z.infer<typeof toothStatusEnum>;

export const toothSurfaceEnum = z.enum(['M', 'O', 'D', 'B', 'L']);
export type ToothSurface = z.infer<typeof toothSurfaceEnum>;

export const surfaceFindingEnum = z.enum([
  'CARIES',
  'RESTORATION_AMALGAM',
  'RESTORATION_COMPOSITE',
  'SEALANT',
  'FRACTURE',
  'WEAR',
]);
export type SurfaceFinding = z.infer<typeof surfaceFindingEnum>;

export const surfaceFindingSchema = z.object({
  surface: toothSurfaceEnum,
  finding: surfaceFindingEnum,
  notes: z.string().max(280).optional(),
});

export const toothEntrySchema = z.object({
  toothCode: z.string().regex(/^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/),
  status: toothStatusEnum.default('PRESENT'),
  notes: z.string().max(280).optional(),
  surfaces: z.array(surfaceFindingSchema).max(5).optional(),
});
export type ToothEntryInput = z.input<typeof toothEntrySchema>;
export type ToothEntryOutput = z.output<typeof toothEntrySchema>;

export const upsertChartSchema = z.object({
  dentition: dentitionEnum.default('ADULT'),
  notes: z.string().max(2000).optional(),
  consultationId: z.string().optional(),
  teeth: z.array(toothEntrySchema).max(52),
});
export type UpsertChartInput = z.input<typeof upsertChartSchema>;
export type UpsertChartOutput = z.output<typeof upsertChartSchema>;

export interface SurfaceFindingRecord {
  id: string;
  surface: ToothSurface;
  finding: SurfaceFinding;
  notes?: string | null;
}
export interface ToothEntryRecord {
  id: string;
  toothCode: string;
  status: ToothStatus;
  notes?: string | null;
  surfaces: SurfaceFindingRecord[];
}
export interface DentalChartRecord {
  id: string;
  patientId: string;
  consultationId?: string | null;
  dentition: Dentition;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  teeth: ToothEntryRecord[];
}

// FDI quadrant layouts for rendering. Order is mesial-to-distal *as you face
// the patient* — upper row reads left-to-right with the patient's right side
// (Q1 = patient's upper-right, viewer's left).
export const ADULT_QUADRANTS = {
  upperRight: ['18', '17', '16', '15', '14', '13', '12', '11'],
  upperLeft:  ['21', '22', '23', '24', '25', '26', '27', '28'],
  lowerLeft:  ['38', '37', '36', '35', '34', '33', '32', '31'],
  lowerRight: ['41', '42', '43', '44', '45', '46', '47', '48'],
};

export const DECIDUOUS_QUADRANTS = {
  upperRight: ['55', '54', '53', '52', '51'],
  upperLeft:  ['61', '62', '63', '64', '65'],
  lowerLeft:  ['75', '74', '73', '72', '71'],
  lowerRight: ['81', '82', '83', '84', '85'],
};

export const STATUS_LABEL: Record<ToothStatus, string> = {
  PRESENT: 'Present',
  MISSING: 'Missing',
  EXTRACTED: 'Extracted',
  IMPLANT: 'Implant',
  CROWNED: 'Crowned',
  ROOT_CANAL: 'Root canal',
  EXTRACTION_NEEDED: 'Extraction needed',
  UNERUPTED: 'Unerupted',
};

export const STATUS_FILL: Record<ToothStatus, string> = {
  PRESENT: '#ffffff',
  MISSING: '#9ca3af',
  EXTRACTED: '#1f2937',
  IMPLANT: '#a78bfa',
  CROWNED: '#fbbf24',
  ROOT_CANAL: '#ef4444',
  EXTRACTION_NEEDED: '#f97316',
  UNERUPTED: '#e5e7eb',
};

export const FINDING_LABEL: Record<SurfaceFinding, string> = {
  CARIES: 'Caries',
  RESTORATION_AMALGAM: 'Amalgam',
  RESTORATION_COMPOSITE: 'Composite',
  SEALANT: 'Sealant',
  FRACTURE: 'Fracture',
  WEAR: 'Wear',
};

export const FINDING_FILL: Record<SurfaceFinding, string> = {
  CARIES: '#dc2626',
  RESTORATION_AMALGAM: '#475569',
  RESTORATION_COMPOSITE: '#3b82f6',
  SEALANT: '#16a34a',
  FRACTURE: '#a855f7',
  WEAR: '#eab308',
};

export const SURFACE_LABEL: Record<ToothSurface, string> = {
  M: 'Mesial',
  O: 'Occlusal',
  D: 'Distal',
  B: 'Buccal',
  L: 'Lingual',
};
