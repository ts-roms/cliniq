'use client';

import { useQuery } from '@tanstack/react-query';
import {
  reportsControllerNoShows,
  reportsControllerOverview,
  reportsControllerRevenue,
  reportsControllerTopServices,
} from '@org/api-client';
import type {
  NoShowRow,
  OverviewReport,
  RevenueSeries,
  TopServiceRow,
} from '../schemas/reports';

export const reportKeys = {
  all: ['reports'] as const,
  overview: () => ['reports', 'overview'] as const,
  revenue: () => ['reports', 'revenue'] as const,
  topServices: (limit: number) => ['reports', 'top-services', limit] as const,
  noShows: () => ['reports', 'no-shows'] as const,
};

export function useOverview() {
  return useQuery({
    queryKey: reportKeys.overview(),
    queryFn: async (): Promise<OverviewReport> => {
      const { data, error } = await reportsControllerOverview();
      if (error || !data) throw new Error('Failed to load overview');
      return data as unknown as OverviewReport;
    },
  });
}

export function useRevenueSeries() {
  return useQuery({
    queryKey: reportKeys.revenue(),
    queryFn: async (): Promise<RevenueSeries> => {
      const { data, error } = await reportsControllerRevenue();
      if (error || !data) throw new Error('Failed to load revenue');
      return data as unknown as RevenueSeries;
    },
  });
}

export function useTopServices(limit = 5) {
  return useQuery({
    queryKey: reportKeys.topServices(limit),
    queryFn: async (): Promise<TopServiceRow[]> => {
      const { data, error } = await reportsControllerTopServices({
        query: { limit },
      });
      if (error || !data) throw new Error('Failed to load services');
      return data as unknown as TopServiceRow[];
    },
  });
}

export function useNoShowRates() {
  return useQuery({
    queryKey: reportKeys.noShows(),
    queryFn: async (): Promise<NoShowRow[]> => {
      const { data, error } = await reportsControllerNoShows();
      if (error || !data) throw new Error('Failed to load no-show rates');
      return data as unknown as NoShowRow[];
    },
  });
}
