'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useListMyAppointmentsQuery, useCancelAppointmentMutation } from '@/store/appointmentsApi';
import { useListMyNotificationsQuery } from '@/store/notificationsApi';
import { getSocket } from '@/lib/socket';
import { FloatingIcon3D } from '@/components/ui/floating-icon-3d';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
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

  return (
    <main className="w-full mt-12 space-y-6 px-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <FloatingIcon3D src="/icons-3d/pill.png" size={160} alt="" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">My appointments</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" nativeButton={false} render={<Link href="/triage" />}>
            Start symptom triage
          </Button>
          <Link href="/notifications" className="text-sm underline">
            Notifications{notifData && notifData.unreadCount > 0 ? ` (${notifData.unreadCount} unread)` : ''}
          </Link>
        </div>
      </div>
      {data?.items.length === 0 ? <EmptyState icon="/icons-3d/calendar.png" message="No appointments yet." /> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data?.items.map((appt) => (
          <Card key={appt._id}>
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
