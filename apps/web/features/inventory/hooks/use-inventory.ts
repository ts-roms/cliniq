'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  inventoryControllerAdjust,
  inventoryControllerCreate,
  inventoryControllerDetail,
  inventoryControllerDispense,
  inventoryControllerExpiring,
  inventoryControllerList,
  inventoryControllerLowStock,
  inventoryControllerReceive,
} from '@org/api-client';
import type {
  CreateItemOutput,
  DispenseOutput,
  ExpiringBatchRow,
  InventoryItemDetail,
  InventoryItemRow,
  LowStockRow,
  ReceiveBatchOutput,
} from '../schemas/inventory';

export const inventoryKeys = {
  all: ['inventory'] as const,
  list: (q: string) => ['inventory', 'list', q] as const,
  detail: (id: string) => ['inventory', 'detail', id] as const,
  lowStock: () => ['inventory', 'low-stock'] as const,
  expiring: (days: number) => ['inventory', 'expiring', days] as const,
};

export function useItems(q = '') {
  return useQuery({
    queryKey: inventoryKeys.list(q),
    queryFn: async (): Promise<InventoryItemRow[]> => {
      // The `q` query param isn't on the OpenAPI surface (raw @Query without
      // @ApiQuery), so we filter client-side after fetching the list.
      const { data, error } = await inventoryControllerList();
      if (error || !data) throw new Error('Failed to load inventory');
      const items = data as unknown as InventoryItemRow[];
      if (!q) return items;
      const needle = q.toLowerCase();
      return items.filter(
        (i) =>
          i.name.toLowerCase().includes(needle) || i.sku.toLowerCase().includes(needle),
      );
    },
    placeholderData: (prev) => prev,
  });
}

export function useItem(id: string) {
  return useQuery({
    queryKey: inventoryKeys.detail(id),
    queryFn: async (): Promise<InventoryItemDetail> => {
      const { data, error } = await inventoryControllerDetail({ path: { id } });
      if (error || !data) throw new Error('Item not found');
      return data as unknown as InventoryItemDetail;
    },
    enabled: !!id,
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateItemOutput) => {
      const { data, error } = await inventoryControllerCreate({
        body: input as Parameters<typeof inventoryControllerCreate>[0]['body'],
      });
      if (error || !data) throw new Error('Create failed');
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.all }),
  });
}

export function useReceiveBatch(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReceiveBatchOutput) => {
      const body = {
        ...input,
        ...(input.expiresOn ? { expiresOn: new Date(input.expiresOn).toISOString() } : {}),
      };
      const { data, error } = await inventoryControllerReceive({
        path: { id: itemId },
        body: body as Parameters<typeof inventoryControllerReceive>[0]['body'],
      });
      if (error || !data) throw new Error('Receive failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inventoryKeys.detail(itemId) });
      qc.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useDispense(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DispenseOutput) => {
      const { data, error } = await inventoryControllerDispense({
        path: { id: itemId },
        body: input as Parameters<typeof inventoryControllerDispense>[0]['body'],
      });
      if (error || !data) throw new Error('Dispense failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inventoryKeys.detail(itemId) });
      qc.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useAdjust(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { delta: number; reason?: string; batchId?: string }) => {
      const { data, error } = await inventoryControllerAdjust({
        path: { id: itemId },
        body: input as Parameters<typeof inventoryControllerAdjust>[0]['body'],
      });
      if (error || !data) throw new Error('Adjust failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inventoryKeys.detail(itemId) });
      qc.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useLowStock() {
  return useQuery({
    queryKey: inventoryKeys.lowStock(),
    queryFn: async (): Promise<LowStockRow[]> => {
      const { data, error } = await inventoryControllerLowStock();
      if (error || !data) throw new Error('Failed');
      return data as unknown as LowStockRow[];
    },
  });
}

export function useExpiring(days = 60) {
  return useQuery({
    queryKey: inventoryKeys.expiring(days),
    queryFn: async (): Promise<ExpiringBatchRow[]> => {
      // `days` query param is not on the OpenAPI surface; backend defaults to 60.
      const { data, error } = await inventoryControllerExpiring();
      if (error || !data) throw new Error('Failed');
      return data as unknown as ExpiringBatchRow[];
    },
  });
}
