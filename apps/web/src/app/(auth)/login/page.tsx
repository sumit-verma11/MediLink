'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLoginMutation } from '@/store/authApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

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
    const { user } = await login(form).unwrap();
    router.push(DASHBOARD_PATH_BY_ROLE[user.role] ?? '/');
  }

  return (
    <Card className="w-full max-w-sm p-7">
      <CardHeader className="gap-1.5 px-0">
        <CardTitle className="text-2xl font-semibold">Log in</CardTitle>
        <CardDescription>Welcome back. Pick up right where you left off.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <Input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Password
            </label>
            <Input
              id="password"
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          {error ? <p className="text-sm text-destructive">Login failed. Check your email and password.</p> : null}
          <Button type="submit" disabled={isLoading} size="lg" className="mt-2 w-full">
            {isLoading ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-medium text-foreground underline underline-offset-2">
            Register
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
