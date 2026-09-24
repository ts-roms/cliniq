import type {
  DentalLabCaseStatus,
  DentalLabClinicLinkStatus,
  DentalLabInvoiceStatus,
} from '../lib/api';

const CASE_STATUS_COLOR: Record<DentalLabCaseStatus, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  SUBMITTED: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  IN_PROGRESS:
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  AWAITING_PICKUP:
    'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  SHIPPED: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
  DELIVERED:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELLED: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const LINK_STATUS_COLOR: Record<DentalLabClinicLinkStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  ACTIVE:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  REVOKED: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
  SUSPENDED: 'bg-zinc-300 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200',
};

export function CaseStatusPill({ status }: { status: DentalLabCaseStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CASE_STATUS_COLOR[status]}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

export function LinkStatusPill({
  status,
}: {
  status: DentalLabClinicLinkStatus;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${LINK_STATUS_COLOR[status]}`}
    >
      {status}
    </span>
  );
}

const INVOICE_STATUS_COLOR: Record<DentalLabInvoiceStatus, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  ISSUED: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  PAID: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  OVERDUE: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  VOID: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
};

export function InvoiceStatusPill({
  status,
}: {
  status: DentalLabInvoiceStatus;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${INVOICE_STATUS_COLOR[status]}`}
    >
      {status}
    </span>
  );
}
