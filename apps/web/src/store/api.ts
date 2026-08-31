import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api',
  credentials: 'include',
});

function isAuthEndpoint(args: string | FetchArgs): boolean {
  const url = typeof args === 'string' ? args : args.url;
  return url.startsWith('/auth/');
}

// The access token is a short-lived (15m) JWT; the refresh token (7d, httpOnly
// cookie) is what actually keeps a session alive. Without this wrapper, every
// query silently 401s after 15 minutes and list pages just render as empty --
// no error, no obvious cause. Module-level `refreshPromise` dedupes concurrent
// 401s (e.g. a dashboard firing several queries at once) into a single
// /auth/refresh call instead of a stampede.
function doRefresh(api: Parameters<typeof rawBaseQuery>[1], extraOptions: Parameters<typeof rawBaseQuery>[2]) {
  return Promise.resolve(rawBaseQuery({ url: '/auth/refresh', method: 'POST' }, api, extraOptions));
}

let refreshPromise: ReturnType<typeof doRefresh> | null = null;

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions
) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401 && !isAuthEndpoint(args)) {
    refreshPromise ??= doRefresh(api, extraOptions).finally(() => {
      refreshPromise = null;
    });
    const refreshResult = await refreshPromise;

    if (!refreshResult.error) {
      result = await rawBaseQuery(args, api, extraOptions);
    } else if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }

  return result;
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['PatientProfile', 'DoctorProfile', 'LabProfile', 'Verification', 'MyAppointments', 'MyPrescriptions', 'TelegramLink'],
  endpoints: () => ({}),
});
