'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLoginMutation } from '@/store/authApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const DASHBOARD_PATH_BY_ROLE: Record<string, string> = {
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
    try {
      const { user } = await login(form).unwrap();
      router.push(DASHBOARD_PATH_BY_ROLE[user.role] ?? '/');
    } catch {
      // `error` from useLoginMutation already drives the message below.
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Log in</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            placeholder="Email"
            aria-label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            placeholder="Password"
            aria-label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          {error ? <p className="text-sm text-destructive">Login failed</p> : null}
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="underline">
            Register
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
