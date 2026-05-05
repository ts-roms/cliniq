export { DentalChartCard } from './components/dental-chart-card';
export { Odontogram } from './components/odontogram';
export {
  useLatestDentalChart,
  useUpsertDentalChart,
  dentalKeys,
} from './hooks/use-dental';
export type {
  Dentition,
  ToothStatus,
  ToothSurface,
  SurfaceFinding,
  ToothEntryRecord,
  DentalChartRecord,
} from './schemas/dental';
