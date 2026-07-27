'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRegisterMutation } from '@/store/authApi';

type RegisterRole = 'patient' | 'doctor' | 'lab' | 'admin';

export default function RegisterPage() {
  const [form, setForm] = useState<{ email: string; password: string; name: string; phone: string; role: RegisterRole }>({
    email: '', password: '', name: '', phone: '', role: 'patient',
  });
  const [register, { isLoading, error }] = useRegisterMutation();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await register(form).unwrap();
    router.push('/login');
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm mx-auto mt-16 space-y-4">
      <h1 className="text-xl font-semibold">Register</h1>
      <input className="border p-2 w-full" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <input className="border p-2 w-full" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input className="border p-2 w-full" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      <input className="border p-2 w-full" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <select className="border p-2 w-full" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as RegisterRole })}>
        <option value="patient">Patient</option>
        <option value="doctor">Doctor</option>
        <option value="lab">Lab</option>
      </select>
      <button className="bg-black text-white px-4 py-2 w-full" disabled={isLoading}>Register</button>
      {error ? <p className="text-red-600">Registration failed</p> : null}
    </form>
  );
}
