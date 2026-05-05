export type ConsentType =
  | 'TREATMENT'
  | 'AI_PROCESSING'
  | 'REMINDERS'
  | 'MARKETING'
  | 'RESEARCH';

export interface PatientConsent {
  id: string;
  patientId: string;
  type: ConsentType;
  granted: boolean;
  version: string;
  acceptedAt: string | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  recordedBy: string | null;
  ip: string | null;
  createdAt: string;
  updatedAt: string;
}

export const CONSENT_LABELS: Record<ConsentType, { label: string; help: string }> = {
  TREATMENT: {
    label: 'Treatment record processing',
    help: 'Required. Allows the clinic to record care delivered to this patient.',
  },
  AI_PROCESSING: {
    label: 'AI scribe + decision support',
    help: 'Optional. Lets us draft consult notes, triage, and flag drug safety with AI.',
  },
  REMINDERS: {
    label: 'Appointment reminders',
    help: 'SMS / email reminders for upcoming visits.',
  },
  MARKETING: {
    label: 'Health tips & clinic updates',
    help: 'Newsletters and promotional messages.',
  },
  RESEARCH: {
    label: 'Anonymised data for research',
    help: 'De-identified data may be used to improve healthcare for Filipinos.',
  },
};

export const CONSENT_ORDER: ConsentType[] = [
  'TREATMENT',
  'AI_PROCESSING',
  'REMINDERS',
  'MARKETING',
  'RESEARCH',
];
