'use client';

import { useEffect } from 'react';
import {
  useListMyAppointmentsQuery,
  useConfirmAppointmentMutation,
  useRejectAppointmentMutation,
} from '@/store/appointmentsApi';
import { getSocket } from '@/lib/socket';

export default function DoctorDashboard() {
  const { data, isLoading, refetch } = useListMyAppointmentsQuery({ status: 'requested' });
  const [confirmAppointment] = useConfirmAppointmentMutation();
  const [rejectAppointment] = useRejectAppointmentMutation();

  useEffect(() => {
    // A doctor's own User id isn't available here without reading auth state (out of
    // scope for this minimal dashboard) — using a placeholder join value means this
    // dashboard won't actually receive live pushes until real auth-state wiring lands;
    // refetch() below on a fixed interval keeps the list correct in the meantime.
    const socket = getSocket('current-user-placeholder');
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
      <h1 className="text-2xl font-bold">Pending requests</h1>
      {data?.items.map((appt) => (
        <div key={appt._id} className="border p-3 rounded flex justify-between items-center">
          <p>{new Date(appt.slotStart).toLocaleString()}</p>
          <div className="space-x-2">
            <button
              className="bg-black text-white px-3 py-1 rounded"
              onClick={async () => { await confirmAppointment(appt._id).unwrap(); refetch(); }}
            >
              Confirm
            </button>
            <button
              className="border px-3 py-1 rounded"
              onClick={async () => { await rejectAppointment({ id: appt._id, reason: 'Not available' }).unwrap(); refetch(); }}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </main>
  );
}
