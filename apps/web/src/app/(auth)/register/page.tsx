'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRegisterMutation } from '@/store/authApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type RegisterRole = 'patient' | 'doctor' | 'lab';

const ROLE_OPTIONS: { value: RegisterRole; label: string }[] = [
  { value: 'patient', label: 'Patient' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'lab', label: 'Lab' },
];

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
    <Card className="w-full max-w-sm p-7">
      <CardHeader className="gap-1.5 px-0">
        <CardTitle className="text-2xl font-semibold">Create your account</CardTitle>
        <CardDescription>Takes less than a minute.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">I am a</span>
            <div className="grid grid-cols-3 gap-2">
              {ROLE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={form.role === value}
                  onClick={() => setForm({ ...form, role: value })}
                  className={cn(
                    'h-9 rounded-lg border text-sm font-medium transition-colors',
                    form.role === value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background text-muted-foreground hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-medium text-foreground">
              Full name
            </label>
            <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <Input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="phone" className="text-sm font-medium text-foreground">
              Phone
            </label>
            <Input id="phone" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Password
            </label>
            <Input id="password" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          {error ? <p className="text-sm text-destructive">Registration failed. Please check your details.</p> : null}
          <Button type="submit" disabled={isLoading} size="lg" className="mt-2 w-full">
            {isLoading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-2">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
