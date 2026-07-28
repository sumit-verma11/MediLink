import { baseApi } from './api';

export interface TriageMessage { role: 'user' | 'assistant'; text: string; at: string }
export interface SpecialtySuggestion { name: string; confidence: number }
export interface TriageSession {
  _id: string;
  messages: TriageMessage[];
  extractedSymptoms: string[];
  suggestedSpecialties: SpecialtySuggestion[];
  recommendedDoctorIds: string[];
  isRedFlag: boolean;
  disclaimerShownAt: string;
}

export const triageApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    sendTriageMessage: builder.mutation<{ session: TriageSession }, { text: string; sessionId?: string }>({
      query: (body) => ({ url: '/triage/messages', method: 'POST', body }),
    }),
    getTriageSession: builder.query<{ session: TriageSession }, string>({
      query: (id) => `/triage/${id}`,
    }),
  }),
});

export const { useSendTriageMessageMutation, useGetTriageSessionQuery } = triageApi;
