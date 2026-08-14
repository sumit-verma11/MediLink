'use client';

import Link from 'next/link';
import { CalendarCheck, ClipboardPlus, FlaskConical } from 'lucide-react';
import { useListMyAppointmentsQuery } from '@/store/appointmentsApi';
import { useListMyPrescriptionsQuery } from '@/store/prescriptionsApi';
import { useListMyLabBookingsAsPatientQuery } from '@/store/labBookingsApi';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

type TimelineEntry =
  | { kind: 'appointment'; at: string; label: string; id: string }
  | { kind: 'prescription'; at: string; label: string; id: string }
  | { kind: 'labBooking'; at: string; label: string; id: string; status: string };

const ICON_BY_KIND = {
  appointment: CalendarCheck,
  prescription: ClipboardPlus,
  labBooking: FlaskConical,
};

export default function PatientTimelinePage() {
  const { data: appointmentsData, isLoading: appointmentsLoading } = useListMyAppointmentsQuery({ status: undefined });
  const { data: prescriptionsData, isLoading: prescriptionsLoading } = useListMyPrescriptionsQuery({ page: 1, limit: 50 });
  const { data: bookingsData, isLoading: bookingsLoading } = useListMyLabBookingsAsPatientQuery({ page: 1, limit: 50 });

  if (appointmentsLoading || prescriptionsLoading || bookingsLoading) {
    return <main className="max-w-2xl">Loading…</main>;
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
    <main className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Health timeline</h1>
        <p className="mt-1 text-muted-foreground">Every visit, prescription, and lab result, in order.</p>
      </div>

      {entries.length === 0 ? <EmptyState icon="/icons-3d/calendar.png" message="No history yet." /> : null}

      <div className="relative space-y-4">
        {entries.length > 0 ? <div aria-hidden className="absolute bottom-2 left-[19px] top-2 w-px bg-border" /> : null}
        {entries.map((entry) => {
          const Icon = ICON_BY_KIND[entry.kind];
          return (
            <div key={`${entry.kind}-${entry.id}`} className="relative flex items-start gap-4">
              <div className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full bg-card ring-1 ring-border">
                <Icon className="size-4 text-primary" />
              </div>
              <Card className="flex-1">
                <CardContent className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{entry.label}</p>
                    <p className="text-xs text-muted-foreground">{new Date(entry.at).toLocaleDateString()}</p>
                  </div>
                  {entry.kind === 'prescription' ? (
                    <Link href={`/prescriptions/${entry.id}`} className="text-sm font-medium text-foreground underline underline-offset-2">
                      View
                    </Link>
                  ) : null}
                  {entry.kind === 'labBooking' && entry.status === 'report_ready' ? (
                    <a
                      className="text-sm font-medium text-foreground underline underline-offset-2"
                      href={`${process.env.NEXT_PUBLIC_API_URL}/lab-bookings/${entry.id}/report`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download report
                    </a>
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
