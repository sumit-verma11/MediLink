'use client';

import { use, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useGetDoctorSlotsQuery, useCreateAppointmentMutation } from '@/store/appointmentsApi';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BackLink } from '@/components/ui/back-link';
import { cn, apiErrorMessage } from '@/lib/utils';

export default function BookAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: doctorId } = use(params);
  const searchParams = useSearchParams();
  const triageSessionId = searchParams.get('triageSessionId') ?? undefined;
  const { data, isLoading } = useGetDoctorSlotsQuery({ doctorId, days: 14 });
  const [createAppointment, { isLoading: isBooking, error }] = useCreateAppointmentMutation();
  const [selected, setSelected] = useState<{ start: string; end: string } | null>(null);
  const router = useRouter();

  async function onBook() {
    if (!selected) return;
    try {
      await createAppointment({ doctorId, slotStart: selected.start, slotEnd: selected.end, triageSessionId }).unwrap();
      router.push('/dashboard/patient');
    } catch {
      // A losing race (409) or a slot the server no longer offers (400) rejects here.
      // The mutation's `error` state already drives the message below, so this catch
      // exists purely so the rejection is handled rather than unhandled.
    }
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl space-y-6 px-6 py-16 md:px-16">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-9 w-full rounded-lg" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-16 md:px-16">
      <BackLink href={`/doctors/${doctorId}`} label="Back to doctor" />
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Book an appointment</h1>
        <p className="mt-1 text-muted-foreground">Pick an open slot in the next two weeks.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {data?.slots.map((slot) => (
          <button
            key={slot.start}
            className={cn(
              'rounded-lg border p-2.5 text-sm transition-colors',
              selected?.start === slot.start
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input hover:bg-secondary/40'
            )}
            onClick={() => setSelected(slot)}
          >
            {new Date(slot.start).toLocaleString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </button>
        ))}
        {data?.slots.length === 0 ? <p className="col-span-full text-sm text-muted-foreground">No open slots in the next 14 days.</p> : null}
      </div>
      <Button size="lg" className="w-full" disabled={!selected || isBooking} onClick={onBook}>
        {isBooking ? 'Booking…' : 'Confirm booking'}
      </Button>
      {error ? <p className="text-sm text-destructive">{apiErrorMessage(error, 'That slot is no longer available. Pick another.')}</p> : null}
    </main>
  );
}
