'use client';

import { useQuery } from '@tanstack/react-query';
import { aiBudgetControllerCurrent } from '@org/api-client';

export interface BudgetUsage {
  monthYear: string;
  budgetCentavos: number;
  spentCentavos: number;
  remainingCentavos: number;
  hardStopped: boolean;
  alertsSent: number;
}

export function useAiBudget() {
  return useQuery({
    queryKey: ['ai-budget', 'current'],
    queryFn: async (): Promise<BudgetUsage> => {
      const { data, error } = await aiBudgetControllerCurrent();
      if (error || !data) throw new Error('Failed to load AI budget');
      return data as unknown as BudgetUsage;
    },
    staleTime: 60_000,
  });
}
