'use client';

import { use, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useGetDoctorSlotsQuery, useCreateAppointmentMutation } from '@/store/appointmentsApi';
import { Button } from '@/components/ui/button';

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

  if (isLoading) return <main className="max-w-2xl mx-auto mt-12">Loading slots…</main>;

  return (
    <main className="max-w-3xl mx-auto mt-12 px-6 space-y-4">
      <h1 className="text-4xl font-bold">Book an appointment</h1>
      <div className="grid grid-cols-3 gap-2">
        {data?.slots.map((slot) => (
          <Button
            key={slot.start}
            size="sm"
            variant={selected?.start === slot.start ? 'default' : 'outline'}
            onClick={() => setSelected(slot)}
          >
            {new Date(slot.start).toLocaleString()}
          </Button>
        ))}
      </div>
      <Button disabled={!selected || isBooking} onClick={onBook}>
        {isBooking ? 'Booking…' : 'Confirm booking'}
      </Button>
      {error ? <p className="text-destructive">That slot is no longer available — pick another.</p> : null}
    </main>
  );
}
