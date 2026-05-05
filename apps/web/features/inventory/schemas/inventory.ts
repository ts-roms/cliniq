import { z } from 'zod';

export const createItemSchema = z.object({
  sku: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, 'alphanumerics, . _ - only'),
  name: z.string().min(1).max(120),
  category: z.string().max(40).optional(),
  unit: z.string().max(20).default('each'),
  reorderLevel: z.coerce.number().int().min(0).default(0),
  defaultPriceCentavos: z.coerce.number().int().min(0).default(0),
  isControlled: z.boolean().default(false),
});
export type CreateItemInput = z.input<typeof createItemSchema>;
export type CreateItemOutput = z.output<typeof createItemSchema>;

export const receiveBatchSchema = z.object({
  receivedQty: z.coerce.number().int().min(1, 'must be at least 1'),
  lotNumber: z.string().max(40).optional(),
  expiresOn: z.string().optional(),
  unitCostCentavos: z.coerce.number().int().min(0).default(0),
  supplierName: z.string().max(120).optional(),
});
export type ReceiveBatchInput = z.input<typeof receiveBatchSchema>;
export type ReceiveBatchOutput = z.output<typeof receiveBatchSchema>;

export const dispenseSchema = z.object({
  quantity: z.coerce.number().int().min(1),
  prescriptionId: z.string().optional(),
  reason: z.string().max(200).optional(),
});
export type DispenseInput = z.input<typeof dispenseSchema>;
export type DispenseOutput = z.output<typeof dispenseSchema>;

export interface InventoryItemRow {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  reorderLevel: number;
  defaultPriceCentavos: number;
  isControlled: boolean;
  active: boolean;
  onHand: number;
  belowReorder: boolean;
}

export interface StockBatch {
  id: string;
  lotNumber: string | null;
  expiresOn: string | null;
  receivedQty: number;
  remainingQty: number;
  unitCostCentavos: number;
  supplierName: string | null;
  receivedAt: string;
}

export interface StockMovement {
  id: string;
  kind: 'RECEIVE' | 'DISPENSE' | 'ADJUST' | 'EXPIRE' | 'RETURN';
  quantity: number;
  reason: string | null;
  prescriptionId: string | null;
  occurredAt: string;
}

export interface InventoryItemDetail extends InventoryItemRow {
  batches: StockBatch[];
  movements: StockMovement[];
}

export interface LowStockRow {
  id: string;
  sku: string;
  name: string;
  unit: string;
  reorderLevel: number;
  onHand: number;
}

export interface ExpiringBatchRow {
  id: string;
  lotNumber: string | null;
  expiresOn: string | null;
  remainingQty: number;
  item: { sku: string; name: string; unit: string };
}
