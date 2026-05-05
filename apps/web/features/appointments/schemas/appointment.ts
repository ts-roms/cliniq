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

export const createAppointmentSchema = z
  .object({
    patientId: z.string().min(1, 'required'),
    providerId: z.string().min(1, 'required'),
    startsAt: z.string().min(1, 'required'),
    endsAt: z.string().min(1, 'required'),
    type: appointmentTypeEnum.default('CONSULT'),
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
  reason: string | null;
  notes: string | null;
  patient?: { id: string; firstName: string; lastName: string; mrn: string };
}
