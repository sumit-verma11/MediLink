import { baseApi } from './api';

export interface PublicDoctorProfile {
  _id: string;
  userId: { _id: string; name: string; avatarUrl?: string };
  specialties: string[];
  qualifications: string[];
  bio: string;
  clinicName: string;
  clinicAddress: string;
  city: string;
  consultationFee: number;
  languages: string[];
  avgRating: number;
  ratingCount: number;
}

export const doctorsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPublicDoctorProfile: builder.query<{ profile: PublicDoctorProfile }, string>({
      query: (doctorId) => `/doctors/public/${doctorId}`,
    }),
  }),
});

export const { useGetPublicDoctorProfileQuery } = doctorsApi;
