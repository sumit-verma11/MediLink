import { baseApi } from './api';

export interface LabReferral {
  _id: string;
  prescriptionId: string;
  doctorId: string;
  patientId: string;
  labId: string;
  suggestedTestCodes: string[];
  token: string;
  status: 'sent' | 'opened' | 'booked' | 'sample_collected' | 'report_ready' | 'closed';
  reportUrl?: string;
  timeline: { status: string; at: string }[];
}
export interface LabTest {
  code: string;
  name: string;
  price: number;
  turnaroundHours: number;
  description?: string;
}
export interface PublicReferralView {
  referral: LabReferral;
  lab: { labName: string; city: string; homeCollection: boolean };
  tests: LabTest[];
  totalPrice: number;
}

export const labReferralsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createReferral: builder.mutation<{ referral: LabReferral }, { prescriptionId: string; labId: string; testCodes: string[] }>({
      query: (body) => ({ url: '/lab-referrals', method: 'POST', body }),
    }),
    getReferralByToken: builder.query<PublicReferralView, string>({
      query: (token) => `/r/${token}`,
    }),
    listMyReferrals: builder.query<{ items: LabReferral[]; total: number }, { page?: number; limit?: number } | void>({
      query: (params) => ({ url: '/lab-referrals/me', params: params ?? undefined }),
    }),
    listReferralsForLab: builder.query<{ items: LabReferral[]; total: number }, { page?: number; limit?: number } | void>({
      query: (params) => ({ url: '/lab-referrals/for-lab', params: params ?? undefined }),
    }),
  }),
});

export const { useCreateReferralMutation, useGetReferralByTokenQuery, useListMyReferralsQuery, useListReferralsForLabQuery } = labReferralsApi;
