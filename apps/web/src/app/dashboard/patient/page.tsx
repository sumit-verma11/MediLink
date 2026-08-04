'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useListMyAppointmentsQuery, useCancelAppointmentMutation } from '@/store/appointmentsApi';
import { useListMyNotificationsQuery } from '@/store/notificationsApi';
import { getSocket } from '@/lib/socket';
import { DashboardHeader } from '@/components/ui/dashboard-header';
import { StatStrip } from '@/components/ui/stat-strip';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, statusAccentClass } from '@/components/ui/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function PatientDashboard() {
  const { data, isLoading, refetch } = useListMyAppointmentsQuery();
  const [cancelAppointment] = useCancelAppointmentMutation();
  const { data: notifData } = useListMyNotificationsQuery();

  useEffect(() => {
    // Live status updates when the doctor confirms/rejects. The server derives this
    // socket's room from the auth cookie; the interval is a fallback for a dropped
    // connection, mirroring the doctor dashboard.
    const socket = getSocket();
    socket.on('appointment:updated', () => refetch());
    const interval = setInterval(refetch, 10000);
    return () => {
      socket.off('appointment:updated');
      clearInterval(interval);
    };
  }, [refetch]);

  if (isLoading) return <main className="max-w-2xl mx-auto mt-12">Loading…</main>;

  const upcoming = data?.items.filter((a) => a.status === 'requested' || a.status === 'confirmed').length ?? 0;
  const completed = data?.items.filter((a) => a.status === 'completed').length ?? 0;
  const unratedCompleted = data?.items.filter((a) => a.status === 'completed' && !a.rated).length ?? 0;

  return (
    <main className="w-full mt-12 space-y-6 px-8">
      <DashboardHeader icon="/icons-3d/pill.png" title="My appointments">
        <Button size="sm" nativeButton={false} render={<Link href="/triage" />}>
          Start symptom triage
        </Button>
        <Link href="/notifications" className="text-sm underline">
          Notifications{notifData && notifData.unreadCount > 0 ? ` (${notifData.unreadCount} unread)` : ''}
        </Link>
      </DashboardHeader>

      {data && data.items.length > 0 ? (
        <StatStrip
          stats={[
            { value: upcoming, label: 'Upcoming' },
            { value: completed, label: 'Completed' },
            { value: unratedCompleted, label: 'To rate' },
            { value: data.items.length, label: 'Total' },
          ]}
        />
      ) : null}

      {data?.items.length === 0 ? <EmptyState icon="/icons-3d/calendar.png" message="No appointments yet." /> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data?.items.map((appt) => (
          <Card key={appt._id} className={statusAccentClass(appt.status)}>
            <CardContent className="flex items-center justify-between gap-4">
              <div>
                <p className="text-lg">{new Date(appt.slotStart).toLocaleString()}</p>
                <StatusBadge status={appt.status} />
                {appt.status === 'rejected' && appt.rejectionReason ? (
                  <p className="text-sm text-muted-foreground">Reason: {appt.rejectionReason}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {appt.status === 'confirmed' || appt.status === 'requested' ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      // A rejected cancel (e.g. inside the 2-hour cutoff) must not become an
                      // unhandled rejection; refetch either way so the list reflects reality.
                      try {
                        await cancelAppointment(appt._id).unwrap();
                      } catch {
                        /* error state is already tracked by the mutation hook */
                      }
                      refetch();
                    }}
                  >
                    Cancel
                  </Button>
                ) : null}
                {appt.status === 'completed' && !appt.rated ? (
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/appointments/${appt._id}/rate`} />}
                  >
                    Rate this appointment
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
