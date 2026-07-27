'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLoginMutation } from '@/store/authApi';

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [login, { isLoading, error }] = useLoginMutation();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await login(form).unwrap();
    router.push('/');
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm mx-auto mt-16 space-y-4">
      <h1 className="text-xl font-semibold">Login</h1>
      <input className="border p-2 w-full" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input className="border p-2 w-full" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <button className="bg-black text-white px-4 py-2 w-full" disabled={isLoading}>Login</button>
      {error ? <p className="text-red-600">Login failed</p> : null}
    </form>
  );
}
