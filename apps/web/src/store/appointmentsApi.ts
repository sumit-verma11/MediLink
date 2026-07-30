import { baseApi } from './api';

export interface Slot { start: string; end: string }
export interface AppointmentTimelineEntry { status: string; at: string; by: string }
export interface Appointment {
  _id: string; doctorId: string; patientId: string; slotStart: string; slotEnd: string;
  status: string; rejectionReason?: string; timeline: AppointmentTimelineEntry[]; triageSummary?: string[] | null;
  rated?: boolean;
}

export const appointmentsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getDoctorSlots: builder.query<{ slots: Slot[] }, { doctorId: string; days?: number }>({
      query: ({ doctorId, days = 14 }) => `/doctors/${doctorId}/slots?days=${days}`,
    }),
    createAppointment: builder.mutation<{ appointment: Appointment }, { doctorId: string; slotStart: string; slotEnd: string; triageSessionId?: string }>({
      query: (body) => ({ url: '/appointments', method: 'POST', body }),
      invalidatesTags: ['MyAppointments'],
    }),
    listMyAppointments: builder.query<{ items: Appointment[]; total: number }, { status?: string } | void>({
      query: (params) => ({ url: '/appointments/me', params: params ?? {} }),
      providesTags: ['MyAppointments'],
    }),
    confirmAppointment: builder.mutation<{ appointment: Appointment }, string>({
      query: (id) => ({ url: `/appointments/${id}/confirm`, method: 'PATCH' }),
      invalidatesTags: ['MyAppointments'],
    }),
    rejectAppointment: builder.mutation<{ appointment: Appointment }, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/appointments/${id}/reject`, method: 'PATCH', body: { reason } }),
      invalidatesTags: ['MyAppointments'],
    }),
    cancelAppointment: builder.mutation<{ appointment: Appointment }, string>({
      query: (id) => ({ url: `/appointments/${id}/cancel`, method: 'PATCH' }),
      invalidatesTags: ['MyAppointments'],
    }),
  }),
});

export const {
  useGetDoctorSlotsQuery,
  useCreateAppointmentMutation,
  useListMyAppointmentsQuery,
  useConfirmAppointmentMutation,
  useRejectAppointmentMutation,
  useCancelAppointmentMutation,
} = appointmentsApi;
