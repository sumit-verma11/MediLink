import { baseApi } from './api';

export const telegramApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    generateTelegramLinkCode: builder.mutation<{ code: string; deepLink: string }, void>({
      query: () => ({ url: '/telegram/link-code', method: 'POST' }),
    }),
    unlinkTelegram: builder.mutation<void, void>({
      query: () => ({ url: '/telegram/link', method: 'DELETE' }),
      invalidatesTags: ['TelegramLink'],
    }),
  }),
});

export const { useGenerateTelegramLinkCodeMutation, useUnlinkTelegramMutation } = telegramApi;
