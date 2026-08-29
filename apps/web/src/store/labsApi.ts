import { baseApi } from './api';

export interface PublicLabProfile {
  _id: string;
  labName: string;
  address: string;
  city: string;
  timings: string;
  homeCollection: boolean;
  avgRating: number;
  ratingCount: number;
}

export const labsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPublicLabProfile: builder.query<{ profile: PublicLabProfile }, string>({
      query: (labId) => `/labs/public/${labId}`,
    }),
  }),
});

export const { useGetPublicLabProfileQuery } = labsApi;
