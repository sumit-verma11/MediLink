import { baseApi } from './api';

interface RegisterRequest {
  email: string; password: string; name: string; phone: string;
  role: 'patient' | 'doctor' | 'lab' | 'admin';
}
interface LoginRequest {
  email: string; password: string;
}
export interface AuthUser {
  id: string; email: string; name: string; role: string;
}

// Every cached query (me, appointments, prescriptions, profiles, ...) is keyed by
// endpoint+args, not by which user is logged in. Without clearing the whole cache on
// login/logout, switching accounts in the same tab (e.g. logging in as Dr. Meera right
// after Amit) keeps serving Amit's cached `me` and dashboard data until a hard refresh --
// resetApiState() wipes everything so every query refetches fresh for the new session.
async function resetApiCache(_arg: unknown, { dispatch, queryFulfilled }: { dispatch: (action: unknown) => void; queryFulfilled: Promise<unknown> }) {
  try {
    await queryFulfilled;
    dispatch(baseApi.util.resetApiState());
  } catch {
    // failed login/logout: leave the existing cache alone
  }
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    register: builder.mutation<{ user: AuthUser }, RegisterRequest>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
    }),
    login: builder.mutation<{ user: AuthUser }, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      onQueryStarted: resetApiCache,
    }),
    logout: builder.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      onQueryStarted: resetApiCache,
    }),
    me: builder.query<{ user: AuthUser }, void>({
      query: () => '/auth/me',
    }),
  }),
});

export const { useRegisterMutation, useLoginMutation, useLogoutMutation, useMeQuery } = authApi;
