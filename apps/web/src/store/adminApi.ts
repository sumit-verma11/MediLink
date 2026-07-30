import { baseApi } from './api';

export interface PendingProfile {
  _id: string;
  verificationStatus: string;
  [key: string]: unknown;
}
export interface AnalyticsSummary {
  totalRegistrations: { patients: number; doctors: number; labs: number };
  appointmentsPerDay: { date: string; count: number }[];
  topSpecialties: { specialty: string; count: number }[];
  triageToBookingConversion: { totalSessions: number; sessionsWithBooking: number; conversionRate: number };
}

export const adminApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listVerifications: builder.query<{ items: PendingProfile[]; total: number }, { role: 'doctor' | 'lab'; status?: string }>({
      query: ({ role, status = 'pending' }) => ({ url: '/admin/verifications', params: { role, status } }),
    }),
    decideVerification: builder.mutation<{ profile: PendingProfile }, { role: 'doctor' | 'lab'; id: string; decision: 'approved' | 'rejected'; reason?: string }>({
      query: ({ role, id, decision, reason }) => ({ url: `/admin/verifications/${role}/${id}/decision`, method: 'POST', body: { decision, reason } }),
    }),
    getAnalytics: builder.query<AnalyticsSummary, void>({
      query: () => '/admin/analytics',
    }),
  }),
});

export const { useListVerificationsQuery, useDecideVerificationMutation, useGetAnalyticsQuery } = adminApi;
