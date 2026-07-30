'use client';

import Link from 'next/link';
import { useListMyAppointmentsQuery } from '@/store/appointmentsApi';
import { useListMyPrescriptionsQuery } from '@/store/prescriptionsApi';
import { useListMyLabBookingsAsPatientQuery } from '@/store/labBookingsApi';

type TimelineEntry =
  | { kind: 'appointment'; at: string; label: string; id: string }
  | { kind: 'prescription'; at: string; label: string; id: string }
  | { kind: 'labBooking'; at: string; label: string; id: string; status: string };

export default function PatientTimelinePage() {
  const { data: appointmentsData, isLoading: appointmentsLoading } = useListMyAppointmentsQuery({ status: undefined });
  const { data: prescriptionsData, isLoading: prescriptionsLoading } = useListMyPrescriptionsQuery({ page: 1, limit: 50 });
  const { data: bookingsData, isLoading: bookingsLoading } = useListMyLabBookingsAsPatientQuery({ page: 1, limit: 50 });

  if (appointmentsLoading || prescriptionsLoading || bookingsLoading) {
    return <main className="max-w-2xl mx-auto mt-12">Loading...</main>;
  }

  const entries: TimelineEntry[] = [
    ...(appointmentsData?.items.map((a) => ({
      kind: 'appointment' as const,
      at: a.slotStart,
      label: `Appointment (${a.status})`,
      id: a._id,
    })) ?? []),
    ...(prescriptionsData?.items.map((p) => ({
      kind: 'prescription' as const,
      at: p.createdAt,
      label: 'Prescription issued',
      id: p._id,
    })) ?? []),
    ...(bookingsData?.items.map((b) => ({
      kind: 'labBooking' as const,
      at: b.scheduledAt,
      label: `Lab test: ${b.testCodes.join(', ')} (${b.status})`,
      id: b._id,
      status: b.status,
    })) ?? []),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Health Timeline</h1>
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={`${entry.kind}-${entry.id}`} className="border p-3 rounded flex justify-between items-center">
            <span>{new Date(entry.at).toLocaleDateString()} — {entry.label}</span>
            {entry.kind === 'prescription' ? (
              <Link href={`/prescriptions/${entry.id}`} className="text-sm underline">
                View
              </Link>
            ) : null}
            {entry.kind === 'labBooking' && entry.status === 'report_ready' ? (
              <a
                className="text-sm underline"
                href={`${process.env.NEXT_PUBLIC_API_URL}/lab-bookings/${entry.id}/report`}
                target="_blank"
                rel="noreferrer"
              >
                Download report
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      {entries.length === 0 ? <p className="text-sm text-gray-600">No history yet.</p> : null}
    </main>
  );
}
