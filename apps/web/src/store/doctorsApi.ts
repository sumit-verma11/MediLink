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

export interface DoctorAnalyticsSummary {
  windowDays: number;
  disclaimer: string;
  earningsByWeek: { weekStart: string; completedCount: number; estimatedEarnings: number }[];
  appointmentBreakdown: { completed: number; cancelled: number; noShow: number; rejected: number; requested: number; confirmed: number };
  noShowCancellationRate: number;
  ratingTrend: { weekStart: string; avgScore: number; count: number }[];
  currentRating: { avgRating: number; ratingCount: number };
  patientVolume: { totalDistinctPatients: number; newPatients: number; returningPatients: number };
}

export const doctorsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPublicDoctorProfile: builder.query<{ profile: PublicDoctorProfile }, string>({
      query: (doctorId) => `/doctors/public/${doctorId}`,
    }),
    getMyAnalytics: builder.query<DoctorAnalyticsSummary, void>({
      query: () => '/doctors/me/analytics',
    }),
  }),
});

export const { useGetPublicDoctorProfileQuery, useGetMyAnalyticsQuery } = doctorsApi;
