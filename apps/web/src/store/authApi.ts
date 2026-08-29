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

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    register: builder.mutation<{ user: AuthUser }, RegisterRequest>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
    }),
    login: builder.mutation<{ user: AuthUser }, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),
    logout: builder.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
    }),
    me: builder.query<{ user: AuthUser }, void>({
      query: () => '/auth/me',
    }),
  }),
});

export const { useRegisterMutation, useLoginMutation, useLogoutMutation, useMeQuery } = authApi;
