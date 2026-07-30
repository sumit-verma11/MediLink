'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  useListMyAppointmentsQuery,
  useConfirmAppointmentMutation,
  useRejectAppointmentMutation,
} from '@/store/appointmentsApi';
import { getSocket } from '@/lib/socket';

export default function DoctorDashboard() {
  const { data, isLoading, refetch } = useListMyAppointmentsQuery({ status: 'requested' });
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
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Pending requests</h1>
        {data?.items.map((appt) => (
          <div key={appt._id} className="border p-3 rounded flex justify-between items-center">
            <div>
              <p>{new Date(appt.slotStart).toLocaleString()}</p>
              {appt.triageSummary && appt.triageSummary.length > 0 ? (
                <p className="text-sm text-gray-600">Symptoms: {appt.triageSummary.join(', ')}</p>
              ) : null}
            </div>
            <div className="space-x-2">
              <button
                className="bg-black text-white px-3 py-1 rounded"
                onClick={async () => { await confirmAppointment(appt._id).unwrap(); refetch(); refetchConfirmed(); }}
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
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold">Confirmed appointments</h2>
        {isConfirmedLoading ? <p>Loading…</p> : null}
        {confirmedData?.items.map((appt) => (
          <div key={appt._id} className="border p-3 rounded flex justify-between items-center">
            <div>
              <p>{new Date(appt.slotStart).toLocaleString()}</p>
              {appt.triageSummary && appt.triageSummary.length > 0 ? (
                <p className="text-sm text-gray-600">Symptoms: {appt.triageSummary.join(', ')}</p>
              ) : null}
            </div>
            {appt.status === 'confirmed' ? (
              <Link href={`/appointments/${appt._id}/prescribe`} className="text-sm underline">
                Write prescription
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </main>
  );
}
