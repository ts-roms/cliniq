export interface Consultation {
  id: string;
  patientId: string;
  providerId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  startedAt: string;
  endedAt: string | null;
  lockedAt?: string | null;
}

export interface SoapNote {
  subjective?: Record<string, unknown> | null;
  objective?: Record<string, unknown> | null;
  assessment?: Record<string, unknown> | null;
  plan?: Record<string, unknown> | null;
}

export interface ConsultationDetail extends Consultation, SoapNote {
  diagnosisCodes: string[];
  suggestions?: AiSuggestion[];
}

export interface AiSuggestion {
  id: string;
  consultationId: string;
  kind: 'SOAP_DRAFT' | 'TRIAGE' | 'INTERACTION_CHECK' | 'DERM_DIFFERENTIAL' | 'SUMMARY';
  status: 'PENDING' | 'ACCEPTED' | 'EDITED_ACCEPTED' | 'REJECTED';
  draftJson: Record<string, unknown>;
  promptVersion: string;
  model: string;
  createdAt: string;
  acceptedAt?: string | null;
  editDistance?: number | null;
}
