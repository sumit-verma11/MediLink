'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useListVerificationsQuery, useDecideVerificationMutation, useGetAnalyticsQuery, type PendingProfile } from '@/store/adminApi';
import { FloatingIcon3D } from '@/components/ui/floating-icon-3d';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function verificationLabel(p: PendingProfile): string {
  return (typeof p.clinicName === 'string' && p.clinicName) || (typeof p.labName === 'string' && p.labName) || p._id;
}

function verificationDetail(p: PendingProfile): string {
  const specialties = Array.isArray(p.specialties) ? p.specialties.join(', ') : null;
  const city = typeof p.city === 'string' ? p.city : null;
  return [specialties, city].filter(Boolean).join(' · ');
}

export default function AdminDashboardPage() {
  const [role, setRole] = useState<'doctor' | 'lab'>('doctor');
  const { data: verifications, isLoading: loadingVerifications, refetch } = useListVerificationsQuery({ role, status: 'pending' });
  const [decide] = useDecideVerificationMutation();
  const { data: analytics, isLoading: loadingAnalytics } = useGetAnalyticsQuery();

  return (
    <main className="w-full mt-12 space-y-8 px-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <FloatingIcon3D src="/icons-3d/bar-chart.png" size={160} alt="" />
          </div>
          <h1 className="text-4xl font-bold">Admin Dashboard</h1>
        </div>
        <Link href="/notifications" className="text-sm underline">Notifications</Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Pending verifications</h2>
        <div className="flex gap-2">
          <Button variant={role === 'doctor' ? 'default' : 'outline'} size="sm" onClick={() => setRole('doctor')}>
            Doctors
          </Button>
          <Button variant={role === 'lab' ? 'default' : 'outline'} size="sm" onClick={() => setRole('lab')}>
            Labs
          </Button>
        </div>
        {loadingVerifications ? <p>Loading…</p> : null}
        {verifications?.items.length === 0 ? <EmptyState icon="/icons-3d/shield.png" message={`No pending ${role}s.`} /> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {verifications?.items.map((p) => (
            <Card key={p._id}>
              <CardContent className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{verificationLabel(p)}</p>
                  <p className="text-sm text-muted-foreground">{verificationDetail(p)}</p>
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
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Analytics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingAnalytics ? <p>Loading…</p> : null}
          {analytics ? (
            <div className="space-y-4">
              <p>Patients: {analytics.totalRegistrations.patients} · Doctors: {analytics.totalRegistrations.doctors} · Labs: {analytics.totalRegistrations.labs}</p>
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="font-semibold">Appointments per day (last 14 days)</p>
                  <div className="grid grid-cols-2 gap-x-4">
                    {analytics.appointmentsPerDay.map((d) => (
                      <p key={d.date} className="text-sm text-muted-foreground">{d.date}: {d.count}</p>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="font-semibold">Top specialties</p>
                  {analytics.topSpecialties.map((s) => (
                    <p key={s.specialty} className="text-sm text-muted-foreground">{s.specialty}: {s.count}</p>
                  ))}
                </div>
              </div>
              <p>
                Triage → booking conversion: {analytics.triageToBookingConversion.conversionRate}%
                {' '}({analytics.triageToBookingConversion.sessionsWithBooking}/{analytics.triageToBookingConversion.totalSessions})
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
