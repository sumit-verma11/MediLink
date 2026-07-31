'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useListMyLabBookingsQuery, useUpdateBookingStatusMutation } from '@/store/labBookingsApi';
import { useListReferralsForLabQuery } from '@/store/labReferralsApi';
import { useListMyNotificationsQuery } from '@/store/notificationsApi';
import { DashboardAnimation } from '@/components/ui/dashboard-animation';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DashboardAnimation path="/animations/lab-header.json" size={96} />
          <h1 className="text-2xl font-bold">Lab Dashboard</h1>
        </div>
        <Link href="/notifications" className="text-sm underline">
          Notifications{notifData && notifData.unreadCount > 0 ? ` (${notifData.unreadCount} unread)` : ''}
        </Link>
      </div>
      {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Incoming referrals</h2>
        {referralsData?.items.length === 0 ? <EmptyState message="No incoming referrals yet." /> : null}
        {referralsData?.items.map((r) => (
          <Card key={r._id}>
            <CardContent>
              <p className="text-lg">Tests: {r.suggestedTestCodes.join(', ')}</p>
              <StatusBadge status={r.status} />
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="space-y-2">
        {data?.items.length === 0 ? <EmptyState message="No bookings yet." /> : null}
        {data?.items.map((booking) => (
          <Card key={booking._id}>
            <CardContent className="space-y-2">
              <p className="text-lg">
                {new Date(booking.scheduledAt).toLocaleString()} — {booking.testCodes.join(', ')} — ₹{booking.totalPrice}
              </p>
              <div className="flex items-center gap-2">
                <StatusBadge status={booking.status} />
                {booking.homeCollection ? (
                  <span className="text-sm text-muted-foreground">(home collection)</span>
                ) : null}
              </div>
              {booking.status === 'booked' ? (
                <Button size="sm" onClick={() => markCollected(booking._id)}>
                  Mark sample collected
                </Button>
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
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
