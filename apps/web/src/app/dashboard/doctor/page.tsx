'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Bell, CalendarCheck2, ClipboardCheck } from 'lucide-react';
import {
  useListMyAppointmentsQuery,
  useConfirmAppointmentMutation,
  useRejectAppointmentMutation,
} from '@/store/appointmentsApi';
import { getSocket } from '@/lib/socket';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function DoctorDashboard() {
  const { data, isLoading, refetch } = useListMyAppointmentsQuery({ status: 'requested' });
  const {
    data: confirmedData,
    isLoading: isConfirmedLoading,
    refetch: refetchConfirmed,
  } = useListMyAppointmentsQuery({ status: 'confirmed' });
  const { data: completedData } = useListMyAppointmentsQuery({ status: 'completed' });
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

  if (isLoading) {
    return (
      <main className="max-w-3xl space-y-10">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-[68px] rounded-xl" />
          ))}
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Good to see you, doctor</h1>
        <p className="mt-1 text-muted-foreground">Review new requests and manage your confirmed schedule.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <Bell className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-semibold text-foreground">{data?.items.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <CalendarCheck2 className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-semibold text-foreground">{confirmedData?.items.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Confirmed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <ClipboardCheck className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-semibold text-foreground">{completedData?.items.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Pending requests</h2>
        {data?.items.length === 0 ? <EmptyState icon="/icons-3d/bell.png" message="No pending requests." /> : null}
        {data?.items.map((appt, i) => (
          <Card key={appt._id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {new Date(appt.slotStart).toLocaleString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <div className="mt-1">
                  <StatusBadge status={appt.status} />
                </div>
                {appt.triageSummary && appt.triageSummary.length > 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">Symptoms: {appt.triageSummary.join(', ')}</p>
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
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Confirmed appointments</h2>
        {isConfirmedLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {confirmedData?.items.length === 0 ? <EmptyState icon="/icons-3d/calendar.png" message="No confirmed appointments." /> : null}
        {confirmedData?.items.map((appt, i) => (
          <Card key={appt._id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {new Date(appt.slotStart).toLocaleString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <div className="mt-1">
                  <StatusBadge status={appt.status} />
                </div>
                {appt.triageSummary && appt.triageSummary.length > 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">Symptoms: {appt.triageSummary.join(', ')}</p>
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
      </section>
    </main>
  );
}
