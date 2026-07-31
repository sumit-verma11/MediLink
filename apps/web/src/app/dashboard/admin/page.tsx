'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useListVerificationsQuery, useDecideVerificationMutation, useGetAnalyticsQuery } from '@/store/adminApi';

export default function AdminDashboardPage() {
  const [role, setRole] = useState<'doctor' | 'lab'>('doctor');
  const { data: verifications, isLoading: loadingVerifications, refetch } = useListVerificationsQuery({ role, status: 'pending' });
  const [decide] = useDecideVerificationMutation();
  const { data: analytics, isLoading: loadingAnalytics } = useGetAnalyticsQuery();

  return (
    <main className="max-w-3xl mx-auto mt-12 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <Link href="/notifications" className="text-sm underline">Notifications</Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Pending verifications</h2>
        <div className="flex gap-2">
          <button className={`border px-3 py-1 rounded ${role === 'doctor' ? 'bg-gray-100' : ''}`} onClick={() => setRole('doctor')}>Doctors</button>
          <button className={`border px-3 py-1 rounded ${role === 'lab' ? 'bg-gray-100' : ''}`} onClick={() => setRole('lab')}>Labs</button>
        </div>
        {loadingVerifications ? <p>Loading…</p> : null}
        {verifications?.items.map((p) => (
          <div key={p._id} className="border p-3 rounded flex justify-between items-center">
            <span>{p._id}</span>
            <div className="flex gap-2">
              <button
                className="border px-3 py-1 rounded"
                onClick={async () => {
                  await decide({ role, id: p._id, decision: 'approved' }).unwrap();
                  refetch();
                }}
              >
                Approve
              </button>
              <button
                className="border px-3 py-1 rounded"
                onClick={async () => {
                  await decide({ role, id: p._id, decision: 'rejected', reason: 'Does not meet verification requirements' }).unwrap();
                  refetch();
                }}
              >
                Reject
              </button>
            </div>
          </div>
        ))}
        {verifications?.items.length === 0 ? <p className="text-sm text-gray-600">No pending {role}s.</p> : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Analytics</h2>
        {loadingAnalytics ? <p>Loading…</p> : null}
        {analytics ? (
          <div className="space-y-2">
            <p>Patients: {analytics.totalRegistrations.patients} · Doctors: {analytics.totalRegistrations.doctors} · Labs: {analytics.totalRegistrations.labs}</p>
            <div>
              <p className="font-semibold">Appointments per day (last 14 days)</p>
              {analytics.appointmentsPerDay.map((d) => (
                <p key={d.date} className="text-sm text-gray-600">{d.date}: {d.count}</p>
              ))}
            </div>
            <div>
              <p className="font-semibold">Top specialties</p>
              {analytics.topSpecialties.map((s) => (
                <p key={s.specialty} className="text-sm text-gray-600">{s.specialty}: {s.count}</p>
              ))}
            </div>
            <p>
              Triage → booking conversion: {analytics.triageToBookingConversion.conversionRate}%
              {' '}({analytics.triageToBookingConversion.sessionsWithBooking}/{analytics.triageToBookingConversion.totalSessions})
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
