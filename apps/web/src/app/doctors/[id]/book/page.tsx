'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGetDoctorSlotsQuery, useCreateAppointmentMutation } from '@/store/appointmentsApi';

export default function BookAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: doctorId } = use(params);
  const { data, isLoading } = useGetDoctorSlotsQuery({ doctorId, days: 14 });
  const [createAppointment, { isLoading: isBooking, error }] = useCreateAppointmentMutation();
  const [selected, setSelected] = useState<{ start: string; end: string } | null>(null);
  const router = useRouter();

  async function onBook() {
    if (!selected) return;
    try {
      await createAppointment({ doctorId, slotStart: selected.start, slotEnd: selected.end }).unwrap();
      router.push('/dashboard/patient');
    } catch {
      // A losing race (409) or a slot the server no longer offers (400) rejects here.
      // The mutation's `error` state already drives the message below, so this catch
      // exists purely so the rejection is handled rather than unhandled.
    }
  }

  if (isLoading) return <main className="max-w-2xl mx-auto mt-12">Loading slots…</main>;

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Book an appointment</h1>
      <div className="grid grid-cols-3 gap-2">
        {data?.slots.map((slot) => (
          <button
            key={slot.start}
            className={`border p-2 rounded ${selected?.start === slot.start ? 'bg-black text-white' : ''}`}
            onClick={() => setSelected(slot)}
          >
            {new Date(slot.start).toLocaleString()}
          </button>
        ))}
      </div>
      <button className="bg-black text-white px-4 py-2 rounded" disabled={!selected || isBooking} onClick={onBook}>
        {isBooking ? 'Booking…' : 'Confirm booking'}
      </button>
      {error ? <p className="text-red-600">That slot is no longer available — pick another.</p> : null}
    </main>
  );
}
