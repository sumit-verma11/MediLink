import { baseApi } from './api';

export interface Rating {
  score: number;
  text?: string;
  createdAt: string;
}

export const ratingsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createRating: builder.mutation<{ rating: unknown }, { appointmentId: string; score: number; text?: string }>({
      query: (body) => ({ url: '/ratings', method: 'POST', body }),
      invalidatesTags: ['MyAppointments'],
    }),
    listDoctorRatings: builder.query<{ items: Rating[]; total: number }, string>({
      query: (doctorId) => `/ratings/doctor/${doctorId}`,
    }),
  }),
});

export const { useCreateRatingMutation, useListDoctorRatingsQuery } = ratingsApi;
