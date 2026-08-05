'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useListMyLabBookingsQuery, useUpdateBookingStatusMutation } from '@/store/labBookingsApi';
import { useListReferralsForLabQuery } from '@/store/labReferralsApi';
import { useListMyNotificationsQuery } from '@/store/notificationsApi';
import { DashboardHeader } from '@/components/ui/dashboard-header';
import { StatStrip } from '@/components/ui/stat-strip';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, statusAccentClass } from '@/components/ui/status-badge';
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
    try {
      await updateStatus({ id, status: 'sample_collected' }).unwrap();
    } catch {
      /* a losing race (e.g. status changed elsewhere) just leaves the card as-is on refetch */
    }
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
    <main className="w-full mt-12 space-y-6 px-8">
      <DashboardHeader icon="/icons-3d/test-tube.png" title="Lab Dashboard">
        <Link href="/notifications" className="text-sm underline">
          Notifications{notifData && notifData.unreadCount > 0 ? ` (${notifData.unreadCount} unread)` : ''}
        </Link>
      </DashboardHeader>

      {(referralsData?.items.length ?? 0) + (data?.items.length ?? 0) > 0 ? (
        <StatStrip
          stats={[
            { value: referralsData?.items.length ?? 0, label: 'Incoming referrals' },
            { value: data?.items.length ?? 0, label: 'Bookings' },
            {
              value: data?.items.filter((b) => b.status === 'report_ready').length ?? 0,
              label: 'Reports ready',
            },
          ]}
        />
      ) : null}

      {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Incoming referrals</h2>
        {referralsData?.items.length === 0 ? <EmptyState icon="/icons-3d/microscope.png" message="No incoming referrals yet." /> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {referralsData?.items.map((r) => (
            <Card key={r._id} className={statusAccentClass(r.status)}>
              <CardContent className="space-y-2">
                <p className="text-lg font-medium">{r.patientName ?? 'Patient'}</p>
                <p className="text-sm text-muted-foreground">
                  Tests: <span className="font-mono">{r.suggestedTestCodes.join(', ')}</span>
                  {r.doctorName ? ` · Referred by ${r.doctorName}` : ''}
                </p>
                <StatusBadge status={r.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <div className="space-y-3">
        <h2 className="text-2xl font-bold">Bookings</h2>
        {data?.items.length === 0 ? <EmptyState icon="/icons-3d/test-tube.png" message="No bookings yet." /> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data?.items.map((booking) => (
            <Card key={booking._id} className={statusAccentClass(booking.status)}>
              <CardContent className="space-y-2">
                <p className="text-lg">
                  <span className="font-mono text-sm text-muted-foreground">{new Date(booking.scheduledAt).toLocaleString()}</span>
                  {' — '}<span className="font-mono">{booking.testCodes.join(', ')}</span> — ₹{booking.totalPrice}
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
