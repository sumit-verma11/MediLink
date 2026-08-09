'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLoginMutation } from '@/store/authApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const ROLE_REDIRECT: Record<string, string> = {
  patient: '/dashboard/patient',
  doctor: '/dashboard/doctor',
  lab: '/dashboard/lab',
  admin: '/dashboard/admin',
};

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [login, { isLoading, error }] = useLoginMutation();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { user } = await login(form).unwrap();
    router.push(ROLE_REDIRECT[user.role] ?? '/');
  }

  return (
    <Card className="w-full max-w-sm p-6">
      <CardHeader className="px-0">
        <CardTitle className="text-xl">Login</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Input
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Button disabled={isLoading} className="w-full">
            Login
          </Button>
          {error ? <p className="text-sm text-destructive">Login failed</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
