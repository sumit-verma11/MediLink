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
import { DashboardAnimation } from '@/components/ui/dashboard-animation';
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
    <main className="max-w-2xl mx-auto mt-12 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DashboardAnimation path="/animations/doctor-header.json" size={96} />
          <h1 className="text-2xl font-bold">Doctor Dashboard</h1>
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

      <div className="space-y-2">
        <h2 className="text-xl font-bold">Pending requests</h2>
        {data?.items.length === 0 ? <EmptyState message="No pending requests." /> : null}
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
                  onClick={async () => { await rejectAppointment({ id: appt._id, reason: 'Not available' }).unwrap(); refetch(); }}
                >
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold">Confirmed appointments</h2>
        {isConfirmedLoading ? <p>Loading…</p> : null}
        {confirmedData?.items.length === 0 ? <EmptyState message="No confirmed appointments." /> : null}
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
    </main>
  );
}
