'use client';

import { useListMyAppointmentsQuery, useCancelAppointmentMutation } from '@/store/appointmentsApi';

export default function PatientDashboard() {
  const { data, isLoading, refetch } = useListMyAppointmentsQuery();
  const [cancelAppointment] = useCancelAppointmentMutation();

  if (isLoading) return <main className="max-w-2xl mx-auto mt-12">Loading…</main>;

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-2">
      <h1 className="text-2xl font-bold">My appointments</h1>
      {data?.items.map((appt) => (
        <div key={appt._id} className="border p-3 rounded flex justify-between items-center">
          <div>
            <p>{new Date(appt.slotStart).toLocaleString()}</p>
            <p className="text-sm text-gray-600">Status: {appt.status}</p>
          </div>
          {appt.status === 'confirmed' || appt.status === 'requested' ? (
            <button
              className="border px-3 py-1 rounded"
              onClick={async () => { await cancelAppointment(appt._id).unwrap(); refetch(); }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ))}
    </main>
  );
}
