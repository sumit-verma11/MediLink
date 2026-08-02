'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useListMyLabBookingsQuery, useUpdateBookingStatusMutation } from '@/store/labBookingsApi';
import { useListReferralsForLabQuery } from '@/store/labReferralsApi';
import { useListMyNotificationsQuery } from '@/store/notificationsApi';
import { FloatingIcon3D } from '@/components/ui/floating-icon-3d';
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
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
      const response = await fetch(`${apiBase}/lab-bookings/${id}/report`, {
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
    <main className="max-w-5xl mx-auto mt-12 space-y-6 px-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <FloatingIcon3D src="/icons-3d/test-tube.png" size={160} alt="" />
          </div>
          <h1 className="text-2xl font-bold">Lab Dashboard</h1>
        </div>
        <Link href="/notifications" className="text-sm underline">
          Notifications{notifData && notifData.unreadCount > 0 ? ` (${notifData.unreadCount} unread)` : ''}
        </Link>
      </div>
      {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Incoming referrals</h2>
        {referralsData?.items.length === 0 ? <EmptyState icon="/icons-3d/microscope.png" message="No incoming referrals yet." /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {referralsData?.items.map((r) => (
            <Card key={r._id}>
              <CardContent className="space-y-2">
                <p className="text-lg font-medium">{r.patientName ?? 'Patient'}</p>
                <p className="text-sm text-muted-foreground">
                  Tests: {r.suggestedTestCodes.join(', ')}{r.doctorName ? ` · Referred by ${r.doctorName}` : ''}
                </p>
                <StatusBadge status={r.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <div className="space-y-3">
        {data?.items.length === 0 ? <EmptyState icon="/icons-3d/test-tube.png" message="No bookings yet." /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
    </main>
  );
}
