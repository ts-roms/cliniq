import { z } from 'zod';

export const appointmentTypeEnum = z.enum([
  'CONSULT',
  'FOLLOWUP',
  'PROCEDURE',
  'TELEMED',
]);
export type AppointmentType = z.infer<typeof appointmentTypeEnum>;

export const appointmentStatusEnum = z.enum([
  'SCHEDULED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);
export type AppointmentStatus = z.infer<typeof appointmentStatusEnum>;

/** `YYYY-MM-DDTHH:mm` (browser local) — what the when-fields produce. */
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'required');

export const createAppointmentSchema = z
  .object({
    patientId: z.string().min(1, 'required'),
    providerId: z.string().min(1, 'required'),
    startsAt: localDateTime,
    endsAt: localDateTime,
    type: appointmentTypeEnum.default('CONSULT'),
    // What the patient is coming in FOR. `type` above is the modality; this
    // is the clinical domain and drives the consult's forms.
    visitTypeId: z.string().optional(),
    reason: z.string().max(200).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    path: ['endsAt'],
    message: 'must be after start',
  });

export type CreateAppointmentInput = z.input<typeof createAppointmentSchema>;
export type CreateAppointmentOutput = z.output<typeof createAppointmentSchema>;

export interface Appointment {
  id: string;
  patientId: string;
  providerId: string;
  startsAt: string;
  endsAt: string;
  type: AppointmentType;
  status: AppointmentStatus;
  visitTypeId?: string | null;
  reason: string | null;
  notes: string | null;
  checkedInAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  noShowAt?: string | null;
  cancelReason?: string | null;
  patient?: { id: string; firstName: string; lastName: string; mrn: string };
  /** Present once the slot has been started (PATCH :id/start or a consult opened with appointmentId). */
  consultation?: { id: string; status: string } | null;
}

export const rescheduleSchema = z
  .object({
    startsAt: localDateTime,
    endsAt: localDateTime,
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    path: ['endsAt'],
    message: 'must be after start',
  });
export type RescheduleInput = z.infer<typeof rescheduleSchema>;
