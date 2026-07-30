import { baseApi } from './api';

export interface Medicine {
  name: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions?: string;
}
export interface RecommendedTest {
  testName: string;
  labReferralId?: string;
}
export interface Prescription {
  _id: string;
  appointmentId: string;
  doctorId: string;
  patientId: string;
  diagnosisNote: string;
  medicines: Medicine[];
  advice: string;
  followUpDate?: string;
  recommendedTests: RecommendedTest[];
  pdfUrl?: string;
  createdAt: string;
  version: number;
  supersededBy?: string;
}

export interface CreatePrescriptionBody {
  appointmentId: string;
  diagnosisNote: string;
  medicines: Medicine[];
  advice: string;
  followUpDate?: string;
  recommendedTests?: RecommendedTest[];
}
export type AmendPrescriptionBody = Omit<CreatePrescriptionBody, 'appointmentId'>;

export interface PublicVerification {
  doctorName: string;
  regNo: string;
  clinicName: string;
  issuedAt: string;
  version: number;
  isLatestVersion: boolean;
}

export const prescriptionsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createPrescription: builder.mutation<{ prescription: Prescription }, CreatePrescriptionBody>({
      query: (body) => ({ url: '/prescriptions', method: 'POST', body }),
      invalidatesTags: ['MyAppointments'],
    }),
    amendPrescription: builder.mutation<{ prescription: Prescription }, { id: string; body: AmendPrescriptionBody }>({
      query: ({ id, body }) => ({ url: `/prescriptions/${id}/amend`, method: 'POST', body }),
    }),
    listMyPrescriptions: builder.query<{ items: Prescription[]; total: number; page: number; limit: number }, { page?: number; limit?: number } | void>({
      query: (params) => ({ url: '/prescriptions/me', params: params ?? undefined }),
    }),
    getPublicVerification: builder.query<{ verification: PublicVerification }, string>({
      query: (id) => `/prescriptions/verify/${id}`,
    }),
  }),
});

export const {
  useCreatePrescriptionMutation,
  useAmendPrescriptionMutation,
  useListMyPrescriptionsQuery,
  useGetPublicVerificationQuery,
} = prescriptionsApi;
