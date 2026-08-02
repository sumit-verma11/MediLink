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
import { FloatingIcon3D } from '@/components/ui/floating-icon-3d';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <FloatingIcon3D src="/icons-3d/stethoscope.png" size={160} alt="" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">Doctor Dashboard</h1>
        </div>
        <div className="flex gap-3">
          <Link href="/notifications" className="text-sm underline">
            Notifications{notifData && notifData.unreadCount > 0 ? ` (${notifData.unreadCount} unread)` : ''}
          </Link>
          <Link href="/dashboard/doctor/referrals" className="text-sm underline">
            Lab referrals sent
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-2xl font-bold">Pending requests</h2>
        {data?.items.length === 0 ? <EmptyState icon="/icons-3d/bell.png" message="No pending requests." /> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data?.items.map((appt) => (
            <Card key={appt._id}>
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
                    onClick={async () => { await confirmAppointment(appt._id).unwrap(); refetch(); refetchConfirmed(); }}
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      const reason = window.prompt('Reason for rejecting this appointment:');
                      if (reason === null) return;
                      await rejectAppointment({ id: appt._id, reason: reason.trim() || 'Not available' }).unwrap();
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
        <h2 className="text-2xl font-bold">Confirmed appointments</h2>
        {isConfirmedLoading ? <p>Loading…</p> : null}
        {confirmedData?.items.length === 0 ? <EmptyState icon="/icons-3d/calendar.png" message="No confirmed appointments." /> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {confirmedData?.items.map((appt) => (
            <Card key={appt._id}>
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
