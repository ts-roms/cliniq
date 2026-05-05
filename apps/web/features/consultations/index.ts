export { ConsultationsCard } from './components/consultations-card';
export { SoapEditor } from './components/soap-editor';
export { SoapDraftPanel } from './components/soap-draft-panel';
export {
  useConsultationsForPatient,
  useStartConsultation,
  consultationKeys,
} from './hooks/use-consultations';
export {
  useConsultation,
  useUpdateSoap,
  useCompleteConsultation,
  useSuggestions,
  useGenerateSoapDraft,
  useDecideSuggestion,
  consultationDetailKeys,
} from './hooks/use-consultation';
export type {
  Consultation,
  ConsultationDetail,
  SoapNote,
  AiSuggestion,
} from './schemas/consultation';
