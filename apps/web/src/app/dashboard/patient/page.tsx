'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Stethoscope, CalendarClock, CheckCircle2, History } from 'lucide-react';
import { useListMyAppointmentsQuery, useCancelAppointmentMutation } from '@/store/appointmentsApi';
import { useGetPublicDoctorProfileQuery } from '@/store/doctorsApi';
import { getSocket } from '@/lib/socket';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function DoctorMini({ doctorId }: { doctorId: string }) {
  const { data } = useGetPublicDoctorProfileQuery(doctorId);
  const profile = data?.profile;

  return (
    <div className="flex items-center gap-3">
      <div className="size-10 shrink-0 overflow-hidden rounded-full bg-secondary ring-1 ring-foreground/10">
        {profile?.userId.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.userId.avatarUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-primary">
            <Stethoscope className="size-5" />
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{profile?.userId.name ?? 'Your doctor'}</p>
        <p className="text-xs text-muted-foreground">{profile?.specialties.join(', ') ?? 'Details loading'}</p>
      </div>
    </div>
  );
}

export default function PatientDashboard() {
  const { data, isLoading, refetch } = useListMyAppointmentsQuery();
  const [cancelAppointment] = useCancelAppointmentMutation();

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

  if (isLoading) {
    return (
      <main className="max-w-3xl space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-40 rounded-lg" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-[68px] rounded-xl" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <Skeleton key={n} className="h-20 rounded-xl" />
          ))}
        </div>
      </main>
    );
  }

  const upcoming = data?.items.filter((a) => a.status === 'confirmed' || a.status === 'requested').length ?? 0;
  const completed = data?.items.filter((a) => a.status === 'completed').length ?? 0;
  const total = data?.items.length ?? 0;

  return (
    <main className="max-w-3xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">My appointments</h1>
          <p className="mt-1 text-muted-foreground">Your upcoming and past visits, all in one place.</p>
        </div>
        <Link href="/triage" className={cn(buttonVariants({ variant: 'accent', size: 'lg' }))}>
          Start symptom triage
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <CalendarClock className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-semibold text-foreground">{upcoming}</p>
              <p className="text-xs text-muted-foreground">Upcoming</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <CheckCircle2 className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-semibold text-foreground">{completed}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <History className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-semibold text-foreground">{total}</p>
              <p className="text-xs text-muted-foreground">All time</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {data?.items.length === 0 ? (
        <EmptyState icon="/icons-3d/calendar.png" message="No appointments yet. Start a symptom triage to find a doctor." />
      ) : null}

      <div className="space-y-3">
        {data?.items.map((appt, i) => (
          <Card key={appt._id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-col gap-2">
                <DoctorMini doctorId={appt.doctorId} />
                <div className="flex flex-wrap items-center gap-2 pl-1">
                  <span className="text-sm text-muted-foreground">
                    {new Date(appt.slotStart).toLocaleString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <StatusBadge status={appt.status} />
                </div>
                {appt.triageSummary && appt.triageSummary.length > 0 ? (
                  <p className="pl-1 text-xs text-muted-foreground">Symptoms: {appt.triageSummary.join(', ')}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {appt.status === 'confirmed' || appt.status === 'requested' ? (
                  <Button
                    variant="outline"
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
