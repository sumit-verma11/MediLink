'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useListMyLabBookingsQuery, useUpdateBookingStatusMutation } from '@/store/labBookingsApi';
import { useListReferralsForLabQuery } from '@/store/labReferralsApi';
import { useListMyNotificationsQuery } from '@/store/notificationsApi';

export default function LabDashboardPage() {
  const { data, isLoading, refetch } = useListMyLabBookingsQuery();
  const [updateStatus] = useUpdateBookingStatusMutation();
  const { data: referralsData } = useListReferralsForLabQuery();
  const { data: notifData } = useListMyNotificationsQuery();
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function markCollected(id: string) {
    await updateStatus({ id, status: 'sample_collected' }).unwrap();
    refetch();
  }

  async function onUploadReport(id: string, file: File) {
    setUploadingId(id);
    setUploadError(null);
    const formData = new FormData();
    formData.append('report', file);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/lab-bookings/${id}/report`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!response.ok) {
        setUploadError('Upload failed — please try again.');
        return;
      }
      refetch();
    } catch {
      setUploadError('Upload failed — please try again.');
    } finally {
      setUploadingId(null);
    }
  }

  if (isLoading) return <main className="max-w-3xl mx-auto mt-12">Loading...</main>;

  return (
    <main className="max-w-3xl mx-auto mt-12 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Lab Dashboard</h1>
        <Link href="/notifications" className="text-sm underline">
          Notifications{notifData && notifData.unreadCount > 0 ? ` (${notifData.unreadCount} unread)` : ''}
        </Link>
      </div>
      {uploadError ? <p className="text-sm text-red-600">{uploadError}</p> : null}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Incoming referrals</h2>
        {referralsData?.items.map((r) => (
          <div key={r._id} className="border p-3 rounded">
            <p>Tests: {r.suggestedTestCodes.join(', ')}</p>
            <p className="text-sm text-gray-600">Status: {r.status}</p>
          </div>
        ))}
        {referralsData?.items.length === 0 ? <p className="text-sm text-gray-600">No incoming referrals yet.</p> : null}
      </section>
      <ul className="space-y-2">
        {data?.items.map((booking) => (
          <li key={booking._id} className="border p-3 rounded space-y-2">
            <p>{new Date(booking.scheduledAt).toLocaleString()} — {booking.testCodes.join(', ')} — ₹{booking.totalPrice}</p>
            <p className="text-sm text-gray-600">Status: {booking.status}{booking.homeCollection ? ' (home collection)' : ''}</p>
            {booking.status === 'booked' ? (
              <button className="text-sm underline" onClick={() => markCollected(booking._id)}>
                Mark sample collected
              </button>
            ) : null}
            {booking.status === 'sample_collected' ? (
              <label className="text-sm underline cursor-pointer">
                {uploadingId === booking._id ? 'Uploading...' : 'Upload report (PDF)'}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onUploadReport(booking._id, file);
                  }}
                />
              </label>
            ) : null}
            {booking.status === 'report_ready' ? <p className="text-sm text-green-700">Report uploaded ✓</p> : null}
          </li>
        ))}
      </ul>
      {data?.items.length === 0 ? <p className="text-sm text-gray-600">No bookings yet.</p> : null}
    </main>
  );
}
