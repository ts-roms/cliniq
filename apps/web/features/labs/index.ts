export { LabOrdersCard } from './components/lab-orders-card';
export { ConsultLabsPanel } from './components/consult-labs-panel';
export { NewLabOrderDialog } from './components/new-order-dialog';
export { RecordResultsDialog } from './components/record-results-dialog';
export {
  labKeys,
  useLabOrdersForPatient,
  useLabOrdersForConsultation,
  useCreateLabOrder,
  useUpdateOrderStatus,
  useCancelOrder,
  useRecordResult,
} from './hooks/use-labs';
export {
  labOrderStatusEnum,
  labAbnormalFlagEnum,
  createOrderSchema,
  recordResultSchema,
  TEST_PRESETS,
  type LabOrder,
  type LabOrderItem,
  type LabOrderStatus,
  type LabAbnormalFlag,
  type CreateOrderInput,
  type CreateOrderOutput,
  type RecordResultInput,
} from './schemas/labs';
