'use client';

import Link from 'next/link';
import { useListMyAppointmentsQuery } from '@/store/appointmentsApi';
import { useListMyPrescriptionsQuery } from '@/store/prescriptionsApi';
import { useListMyLabBookingsAsPatientQuery } from '@/store/labBookingsApi';
import { FloatingIcon3D } from '@/components/ui/floating-icon-3d';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type TimelineEntry =
  | { kind: 'appointment'; at: string; label: string; id: string }
  | { kind: 'prescription'; at: string; label: string; id: string }
  | { kind: 'labBooking'; at: string; label: string; id: string; status: string };

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

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
    <main className="w-full mt-12 px-8 space-y-4">
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <FloatingIcon3D src="/icons-3d/calendar.png" size={160} alt="" />
        </div>
        <h1 className="font-heading text-4xl font-semibold">Health Timeline</h1>
      </div>
      {entries.length === 0 ? <EmptyState icon="/icons-3d/calendar.png" message="No history yet." /> : null}

      {/* Every step in this list is a link in the same chain of custody the
          landing page's signature motif represents -- a real connected
          timeline, not a card grid, because order and continuity are the
          actual content here. */}
      <div className="relative max-w-2xl space-y-6 pl-10">
        <div className="absolute top-2 bottom-2 left-[15px] w-0.5 bg-border" aria-hidden="true" />
        {entries.map((entry) => {
          const nodeColor =
            entry.kind === 'appointment' ? 'bg-primary' : entry.kind === 'prescription' ? 'bg-accent' : 'bg-verified';
          return (
            <div key={`${entry.kind}-${entry.id}`} className="relative">
              <span
                className={`absolute top-1/2 -left-[31px] size-3 -translate-y-1/2 rounded-full ring-4 ring-background ${nodeColor}`}
                aria-hidden="true"
              />
              <Card>
                <CardContent className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {new Date(entry.at).toLocaleDateString()}
                    </p>
                    <p>{entry.label}</p>
                  </div>
                  {entry.kind === 'prescription' ? (
                    <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/prescriptions/${entry.id}`} />}>
                      View
                    </Button>
                  ) : null}
                  {entry.kind === 'labBooking' && entry.status === 'report_ready' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      nativeButton={false}
                      render={
                        <a href={`${API_BASE}/lab-bookings/${entry.id}/report`} target="_blank" rel="noreferrer" />
                      }
                    >
                      Download report
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </main>
  );
}
