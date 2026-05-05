import { z } from 'zod';

export const generateDermSchema = z.object({
  fileIds: z.array(z.string().min(1)).min(1).max(8),
  presentingComplaint: z.string().max(280).optional(),
});
export type GenerateDermInput = z.infer<typeof generateDermSchema>;

export interface DermDifferential {
  condition: string;
  likelihood: 'low' | 'moderate' | 'high';
  reasoning: string;
}

export interface DermDraft {
  differentials: DermDifferential[];
  recommendedNextSteps: string[];
  redFlags: string[];
  uncertainty: string[];
  disclaimer?: string;
}

export interface DermSuggestion {
  id: string;
  type: string;
  status: 'PENDING' | 'ACCEPTED' | 'EDITED' | 'REJECTED';
  draft: DermDraft;
  createdAt: string;
}
