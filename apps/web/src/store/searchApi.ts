import { baseApi } from './api';

export interface DoctorSearchResult {
  _id: string;
  specialties: string[];
  city: string;
  consultationFee: number;
  avgRating: number;
  ratingCount: number;
  userId: { name: string; avatarUrl?: string };
}
export interface LabSearchResult {
  _id: string;
  labName: string;
  city: string;
  homeCollection: boolean;
  tests: { code: string; name: string; price: number }[];
}

export const searchApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    searchDoctors: builder.query<{ items: DoctorSearchResult[]; total: number }, { name?: string; specialty?: string; city?: string }>({
      query: (params) => ({ url: '/doctors', params }),
    }),
    searchLabs: builder.query<{ items: LabSearchResult[]; total: number }, { testCode?: string; testName?: string; city?: string }>({
      query: (params) => ({ url: '/labs', params }),
    }),
  }),
});

export const { useSearchDoctorsQuery, useSearchLabsQuery } = searchApi;
