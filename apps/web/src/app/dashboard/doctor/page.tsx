'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  useListMyAppointmentsQuery,
  useConfirmAppointmentMutation,
  useRejectAppointmentMutation,
} from '@/store/appointmentsApi';
import { useListMyNotificationsQuery } from '@/store/notificationsApi';
import { getSocket } from '@/lib/socket';
import { DashboardHeader } from '@/components/ui/dashboard-header';
import { StatStrip } from '@/components/ui/stat-strip';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, statusAccentClass } from '@/components/ui/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function DoctorDashboard() {
  const { data, isLoading, refetch } = useListMyAppointmentsQuery({ status: 'requested' });
  const { data: notifData } = useListMyNotificationsQuery();
  const {
    data: confirmedData,
    isLoading: isConfirmedLoading,
    refetch: refetchConfirmed,
  } = useListMyAppointmentsQuery({ status: 'confirmed' });
  const [confirmAppointment] = useConfirmAppointmentMutation();
  const [rejectAppointment] = useRejectAppointmentMutation();

  useEffect(() => {
    // The server derives this socket's room from the auth cookie, so no user id is
    // needed here; the interval below is a fallback for a dropped socket connection.
    const socket = getSocket();
    const onUpdated = () => {
      refetch();
      refetchConfirmed();
    };
    socket.on('appointment:updated', onUpdated);
    const interval = setInterval(onUpdated, 10000);
    return () => {
      socket.off('appointment:updated', onUpdated);
      clearInterval(interval);
    };
  }, [refetch, refetchConfirmed]);

  if (isLoading) return <main className="max-w-2xl mx-auto mt-12">Loading…</main>;

  return (
    <main className="w-full mt-12 space-y-8 px-8">
      <DashboardHeader icon="/icons-3d/stethoscope.png" title="Doctor Dashboard">
        <Link href="/notifications" className="text-sm underline">
          Notifications{notifData && notifData.unreadCount > 0 ? ` (${notifData.unreadCount} unread)` : ''}
        </Link>
        <Link href="/dashboard/doctor/referrals" className="text-sm underline">
          Lab referrals sent
        </Link>
      </DashboardHeader>

      {(data?.items.length ?? 0) + (confirmedData?.items.length ?? 0) > 0 ? (
        <StatStrip
          stats={[
            { value: data?.items.length ?? 0, label: 'Pending requests' },
            { value: confirmedData?.items.length ?? 0, label: 'Confirmed' },
          ]}
        />
      ) : null}

      <div className="space-y-3">
        <h2 className="font-heading text-2xl font-semibold">Pending requests</h2>
        {data?.items.length === 0 ? <EmptyState icon="/icons-3d/bell.png" message="No pending requests." /> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data?.items.map((appt) => (
            <Card key={appt._id} className={statusAccentClass(appt.status)}>
              <CardContent className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-lg">{new Date(appt.slotStart).toLocaleString()}</p>
                  <StatusBadge status={appt.status} />
                  {appt.triageSummary && appt.triageSummary.length > 0 ? (
                    <p className="text-sm text-muted-foreground">Symptoms: {appt.triageSummary.join(', ')}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      // A losing race (e.g. the patient just cancelled) rejects here; refetch
                      // either way so the list reflects reality instead of a stale card.
                      try {
                        await confirmAppointment(appt._id).unwrap();
                      } catch {
                        /* ignored, see comment above */
                      }
                      refetch();
                      refetchConfirmed();
                    }}
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      const reason = window.prompt('Reason for rejecting this appointment:');
                      if (reason === null) return;
                      try {
                        await rejectAppointment({ id: appt._id, reason: reason.trim() || 'Not available' }).unwrap();
                      } catch {
                        /* ignored, see comment above */
                      }
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
      </div>

      <div className="space-y-3">
        <h2 className="font-heading text-2xl font-semibold">Confirmed appointments</h2>
        {isConfirmedLoading ? <p>Loading…</p> : null}
        {confirmedData?.items.length === 0 ? <EmptyState icon="/icons-3d/calendar.png" message="No confirmed appointments." /> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {confirmedData?.items.map((appt) => (
            <Card key={appt._id} className={statusAccentClass(appt.status)}>
              <CardContent className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-lg">{new Date(appt.slotStart).toLocaleString()}</p>
                  <StatusBadge status={appt.status} />
                  {appt.triageSummary && appt.triageSummary.length > 0 ? (
                    <p className="text-sm text-muted-foreground">Symptoms: {appt.triageSummary.join(', ')}</p>
                  ) : null}
                </div>
                {appt.status === 'confirmed' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/appointments/${appt._id}/prescribe`} />}
                  >
                    Write prescription
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
