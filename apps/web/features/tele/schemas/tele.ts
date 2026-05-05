export type TeleRole = 'DOCTOR' | 'PATIENT';
export type TeleSignalKind =
  | 'OFFER'
  | 'ANSWER'
  | 'ICE'
  | 'JOIN'
  | 'LEAVE'
  | 'CHAT'
  | 'CONSENT_REQUEST'
  | 'CONSENT_RESPONSE';
export type TeleSessionStatus = 'PENDING' | 'ACTIVE' | 'ENDED' | 'CANCELLED';

export interface ProviderSession {
  id: string;
  status: TeleSessionStatus;
  patientId: string;
  providerId: string;
  appointmentId: string | null;
  consultationId: string | null;
  joinToken: string;
  joinUrl: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface PatientJoinResponse {
  id: string;
  status: TeleSessionStatus;
  patientId: string;
  providerId: string;
  patientToken: string;
  startedAt: string | null;
  endedAt: string | null;
  patient: { firstName: string; lastName: string };
  provider: { name: string | null };
}

export interface TeleSignal {
  id: string;
  seq: number;
  fromRole: TeleRole;
  kind: TeleSignalKind;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface IceConfig {
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
}
