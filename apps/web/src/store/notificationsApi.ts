import { baseApi } from './api';

export interface AppNotification {
  _id: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  readAt?: string;
  createdAt: string;
}

export const notificationsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listMyNotifications: builder.query<{ items: AppNotification[]; total: number; unreadCount: number }, void>({
      query: () => '/notifications/me',
    }),
    markNotificationRead: builder.mutation<{ notification: AppNotification }, string>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: 'PATCH' }),
    }),
  }),
});

export const { useListMyNotificationsQuery, useMarkNotificationReadMutation } = notificationsApi;
