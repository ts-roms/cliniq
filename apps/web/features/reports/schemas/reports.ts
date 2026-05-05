export interface OverviewReport {
  period: { from: string; to: string };
  patients: {
    addedThisMonth: number;
    addedLastMonth: number;
    deltaPct: number | null;
  };
  consults: {
    activeNow: number;
    startedThisMonth: number;
  };
  revenue: {
    collectedCentavos: number;
    outstandingCentavos: number;
  };
  ai: {
    budgetCentavos: number | null;
    spentCentavos: number;
    hardStopped: boolean;
    suggestions: Array<{ kind: string; status: string; count: number }>;
  };
  prescriptions: { writtenThisMonth: number };
  compliance: { openDsr: number };
  startOfToday: string;
}

export interface RevenuePoint {
  date: string;
  amountCentavos: number;
}

export interface RevenueSeries {
  from: string;
  to: string;
  points: RevenuePoint[];
}

export interface TopServiceRow {
  description: string;
  revenueCentavos: number;
  count: number;
}

export interface NoShowRow {
  providerId: string;
  total: number;
  noShow: number;
  cancelled: number;
  completed: number;
  noShowRate: number;
}
