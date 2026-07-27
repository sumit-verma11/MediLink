import { baseApi } from './api';

interface RegisterRequest {
  email: string; password: string; name: string; phone: string;
  role: 'patient' | 'doctor' | 'lab' | 'admin';
}
interface LoginRequest {
  email: string; password: string;
}
interface AuthUser {
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
  }),
});

export const { useRegisterMutation, useLoginMutation } = authApi;
