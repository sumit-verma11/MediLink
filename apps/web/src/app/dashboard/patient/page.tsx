'use client';

import { useEffect } from 'react';
import { useListMyAppointmentsQuery, useCancelAppointmentMutation } from '@/store/appointmentsApi';
import { getSocket } from '@/lib/socket';

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
            </button>
          ) : null}
        </div>
      ))}
    </main>
  );
}
