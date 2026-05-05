export { InventoryTable } from './components/inventory-table';
export { InventoryAlertsCards } from './components/alerts-cards';
export { NewItemDialog } from './components/new-item-dialog';
export { ReceiveBatchDialog } from './components/receive-batch-dialog';
export { DispenseDialog } from './components/dispense-dialog';
export {
  inventoryKeys,
  useItems,
  useItem,
  useCreateItem,
  useReceiveBatch,
  useDispense,
  useAdjust,
  useLowStock,
  useExpiring,
} from './hooks/use-inventory';
export {
  createItemSchema,
  receiveBatchSchema,
  dispenseSchema,
  type CreateItemInput,
  type CreateItemOutput,
  type ReceiveBatchInput,
  type ReceiveBatchOutput,
  type DispenseInput,
  type DispenseOutput,
  type InventoryItemRow,
  type InventoryItemDetail,
  type StockBatch,
  type StockMovement,
  type LowStockRow,
  type ExpiringBatchRow,
} from './schemas/inventory';
