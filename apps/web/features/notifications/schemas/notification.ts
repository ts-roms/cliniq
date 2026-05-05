export type NotificationKind =
  | 'APPOINTMENT_REMINDER'
  | 'HMO_CLAIM_UPDATE'
  | 'LAB_REPORTED'
  | 'LAB_ABNORMAL'
  | 'INVENTORY_LOW'
  | 'DSR_FILED'
  | 'DSR_RESOLVED'
  | 'AI_BUDGET_ALERT'
  | 'GENERAL';

export type NotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Notification {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  link: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}
