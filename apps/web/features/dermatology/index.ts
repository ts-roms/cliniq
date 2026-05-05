export { DermatologyPanel } from './components/dermatology-panel';
export { ImageUploader } from './components/image-uploader';
export { DermDraftView } from './components/derm-draft-view';
export { useImageUpload, type UploadedImage } from './hooks/use-image-upload';
export { useGenerateDermDraft } from './hooks/use-derm';
export {
  generateDermSchema,
  type GenerateDermInput,
  type DermDraft,
  type DermDifferential,
  type DermSuggestion,
} from './schemas/derm';
