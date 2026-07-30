import { baseApi } from './api';

export interface LabBooking {
  _id: string;
  referralId?: string;
  patientId: string;
  labId: string;
  testCodes: string[];
  totalPrice: number;
  scheduledAt: string;
  homeCollection: boolean;
  status: 'booked' | 'sample_collected' | 'report_ready' | 'cancelled';
  reportUrl?: string;
}

export const labBookingsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createBooking: builder.mutation<
      { booking: LabBooking },
      { labId: string; testCodes: string[]; scheduledAt: string; homeCollection: boolean; referralToken?: string }
    >({
      query: ({ referralToken, ...body }) => ({
        url: `/lab-bookings${referralToken ? `?referralToken=${referralToken}` : ''}`,
        method: 'POST',
        body,
      }),
    }),
    // Lab-scoped view: the lab's own incoming bookings, via GET /lab-bookings/me.
    listMyLabBookings: builder.query<{ items: LabBooking[]; total: number }, { page?: number; limit?: number } | void>({
      query: (params) => ({ url: '/lab-bookings/me', params: params ?? undefined }),
    }),
    // Patient-scoped view: the bookings a patient made themselves, via GET
    // /lab-bookings/mine (distinct endpoint -- /me above 403s for a patient).
    listMyLabBookingsAsPatient: builder.query<{ items: LabBooking[]; total: number }, { page?: number; limit?: number } | void>({
      query: (params) => ({ url: '/lab-bookings/mine', params: params ?? undefined }),
    }),
    updateBookingStatus: builder.mutation<{ booking: LabBooking }, { id: string; status: 'sample_collected' | 'report_ready' }>({
      query: ({ id, status }) => ({ url: `/lab-bookings/${id}/status`, method: 'PATCH', body: { status } }),
    }),
  }),
});

export const {
  useCreateBookingMutation,
  useListMyLabBookingsQuery,
  useListMyLabBookingsAsPatientQuery,
  useUpdateBookingStatusMutation,
} = labBookingsApi;
