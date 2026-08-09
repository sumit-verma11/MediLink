'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRegisterMutation } from '@/store/authApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

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
    <Card className="w-full max-w-sm p-6">
      <CardHeader className="px-0">
        <CardTitle className="text-xl">Register</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <select
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as RegisterRole })}
          >
            <option value="patient">Patient</option>
            <option value="doctor">Doctor</option>
            <option value="lab">Lab</option>
          </select>
          <Button disabled={isLoading} className="w-full">
            Register
          </Button>
          {error ? <p className="text-sm text-destructive">Registration failed</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
