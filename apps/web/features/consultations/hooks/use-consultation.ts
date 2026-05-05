'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  consultationsControllerComplete,
  consultationsControllerFindOne,
  consultationsControllerGenerateSoap,
  consultationsControllerListSuggestions,
  consultationsControllerDecideSuggestion,
  consultationsControllerUpdate,
} from '@org/api-client';
import type {
  AiSuggestion,
  ConsultationDetail,
  SoapNote,
} from '../schemas/consultation';

export const consultationDetailKeys = {
  detail: (id: string) => ['consultations', 'detail', id] as const,
  suggestions: (id: string) => ['consultations', id, 'suggestions'] as const,
};

export function useConsultation(id: string) {
  return useQuery({
    queryKey: consultationDetailKeys.detail(id),
    queryFn: async (): Promise<ConsultationDetail> => {
      const { data, error } = await consultationsControllerFindOne({ path: { id } });
      if (error || !data) throw new Error('Consultation not found');
      return data as unknown as ConsultationDetail;
    },
  });
}

export function useUpdateSoap(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (note: SoapNote) => {
      const { data, error } = await consultationsControllerUpdate({
        path: { id },
        body: note as unknown as Record<string, never>,
      });
      if (error || !data) throw new Error('Failed to save consultation');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: consultationDetailKeys.detail(id) });
    },
  });
}

export function useCompleteConsultation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await consultationsControllerComplete({
        path: { id },
      });
      if (error || !data) throw new Error('Failed to complete');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: consultationDetailKeys.detail(id) });
    },
  });
}

export function useSuggestions(id: string) {
  return useQuery({
    queryKey: consultationDetailKeys.suggestions(id),
    queryFn: async (): Promise<AiSuggestion[]> => {
      const { data, error } = await consultationsControllerListSuggestions({
        path: { id },
      });
      if (error) throw new Error('Failed to load suggestions');
      return (data ?? []) as unknown as AiSuggestion[];
    },
  });
}

export function useGenerateSoapDraft(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transcript: string) => {
      const { data, error } = await consultationsControllerGenerateSoap({
        path: { id },
        body: { transcript },
      });
      if (error || !data) throw new Error('Draft generation failed');
      return data as unknown as AiSuggestion;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: consultationDetailKeys.suggestions(id) });
    },
  });
}

export function useDecideSuggestion(consultId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      suggestionId: string;
      decision: 'ACCEPT' | 'EDIT_ACCEPT' | 'REJECT';
      editedContent?: Record<string, unknown>;
    }) => {
      const { data, error } = await consultationsControllerDecideSuggestion({
        path: { id: consultId, sid: input.suggestionId },
        body: {
          decision: input.decision,
          editedContent: input.editedContent,
        },
      });
      if (error || !data) throw new Error('Failed to decide suggestion');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: consultationDetailKeys.suggestions(consultId) });
      queryClient.invalidateQueries({ queryKey: consultationDetailKeys.detail(consultId) });
    },
  });
}
