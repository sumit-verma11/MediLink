'use client';

import { useState } from 'react';
import { Users, Stethoscope, FlaskConical, ShieldCheck } from 'lucide-react';
import { useListVerificationsQuery, useDecideVerificationMutation, useGetAnalyticsQuery } from '@/store/adminApi';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export default function AdminDashboardPage() {
  const [role, setRole] = useState<'doctor' | 'lab'>('doctor');
  const { data: verifications, isLoading: loadingVerifications, refetch } = useListVerificationsQuery({ role, status: 'pending' });
  const [decide] = useDecideVerificationMutation();
  const { data: analytics, isLoading: loadingAnalytics } = useGetAnalyticsQuery();

  return (
    <main className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Admin dashboard</h1>
        <p className="mt-1 text-muted-foreground">Verify new providers and keep an eye on platform activity.</p>
      </div>

      <section className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <Users className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-semibold text-foreground">{analytics?.totalRegistrations.patients ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Patients</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <Stethoscope className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-semibold text-foreground">{analytics?.totalRegistrations.doctors ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Doctors</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <FlaskConical className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-semibold text-foreground">{analytics?.totalRegistrations.labs ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Labs</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Pending verifications</h2>
          <div className="flex gap-2">
            <Button variant={role === 'doctor' ? 'default' : 'outline'} size="sm" onClick={() => setRole('doctor')}>
              Doctors
            </Button>
            <Button variant={role === 'lab' ? 'default' : 'outline'} size="sm" onClick={() => setRole('lab')}>
              Labs
            </Button>
          </div>
        </div>
        {loadingVerifications ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {verifications?.items.length === 0 ? <EmptyState icon="/icons-3d/shield.png" message={`No pending ${role}s.`} /> : null}
        {verifications?.items.map((p) => {
          const name = asText(p.clinicName) || asText(p.labName) || 'Pending profile';
          const city = asText(p.city);
          return (
            <Card key={p._id}>
              <CardContent className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <ShieldCheck className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{name}</p>
                    {city ? <p className="text-xs text-muted-foreground">{city}</p> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      await decide({ role, id: p._id, decision: 'approved' }).unwrap();
                      refetch();
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      await decide({ role, id: p._id, decision: 'rejected', reason: 'Does not meet verification requirements' }).unwrap();
                      refetch();
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Analytics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {loadingAnalytics ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {analytics ? (
            <>
              <div>
                <p className="text-sm font-semibold text-foreground">Appointments per day (last 14 days)</p>
                <div className="mt-2 flex items-end gap-1.5">
                  {analytics.appointmentsPerDay.map((d) => {
                    const max = Math.max(1, ...analytics.appointmentsPerDay.map((x) => x.count));
                    return (
                      <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${d.count}`}>
                        <div
                          className="w-full rounded-t bg-accent"
                          style={{ height: `${Math.max(4, (d.count / max) * 64)}px` }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Top specialties</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {analytics.topSpecialties.map((s) => (
                    <span key={s.specialty} className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
                      {s.specialty} &middot; {s.count}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Triage to booking conversion: <span className="font-semibold text-foreground">{analytics.triageToBookingConversion.conversionRate}%</span>
                {' '}({analytics.triageToBookingConversion.sessionsWithBooking}/{analytics.triageToBookingConversion.totalSessions} sessions)
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
