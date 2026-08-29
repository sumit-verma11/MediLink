'use client';

import { useState } from 'react';
import { FlaskConical, Upload, CheckCircle2, Inbox, FileCheck2 } from 'lucide-react';
import { useListMyLabBookingsQuery, useUpdateBookingStatusMutation } from '@/store/labBookingsApi';
import { useListReferralsForLabQuery } from '@/store/labReferralsApi';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function LabDashboardPage() {
  const { data, isLoading, refetch } = useListMyLabBookingsQuery();
  const [updateStatus] = useUpdateBookingStatusMutation();
  const { data: referralsData } = useListReferralsForLabQuery();
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function markCollected(id: string) {
    await updateStatus({ id, status: 'sample_collected' }).unwrap();
    refetch();
  }

  async function onUploadReport(id: string, file: File) {
    setUploadingId(id);
    setUploadError(null);
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
    const formData = new FormData();
    formData.append('report', file);
    try {
      let response = await fetch(`${apiBase}/lab-bookings/${id}/report`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      // This fetch is outside RTK Query's baseQueryWithReauth wrapper, so a stale
      // 15-minute access token cookie gets no automatic refresh -- retry once after
      // refreshing, same as every RTK Query call already does.
      if (response.status === 401) {
        await fetch(`${apiBase}/auth/refresh`, { method: 'POST', credentials: 'include' });
        response = await fetch(`${apiBase}/lab-bookings/${id}/report`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
      }
      if (!response.ok) {
        setUploadError('Upload failed. Please try again.');
        return;
      }
      refetch();
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploadingId(null);
    }
  }

  if (isLoading) {
    return (
      <main className="max-w-3xl space-y-10">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-[68px] rounded-xl" />
          ))}
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Lab dashboard</h1>
        <p className="mt-1 text-muted-foreground">Incoming referrals and bookings, from sample to report.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <Inbox className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-semibold text-foreground">{referralsData?.items.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Referrals</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <FlaskConical className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-semibold text-foreground">{data?.items.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Bookings</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
              <FileCheck2 className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-semibold text-foreground">
                {data?.items.filter((b) => b.status === 'report_ready').length ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Reports ready</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Incoming referrals</h2>
        {referralsData?.items.length === 0 ? <EmptyState icon="/icons-3d/microscope.png" message="No incoming referrals yet." /> : null}
        {referralsData?.items.map((r) => (
          <Card key={r._id}>
            <CardContent className="flex items-center gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
                <FlaskConical className="size-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{r.suggestedTestCodes.join(', ')}</p>
                <div className="mt-1">
                  <StatusBadge status={r.status} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Bookings</h2>
        {data?.items.length === 0 ? <EmptyState icon="/icons-3d/test-tube.png" message="No bookings yet." /> : null}
        {data?.items.map((booking) => (
          <Card key={booking._id}>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {new Date(booking.scheduledAt).toLocaleString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {booking.testCodes.join(', ')} &middot; ₹{booking.totalPrice}
                    {booking.homeCollection ? ' · home collection' : ''}
                  </p>
                </div>
                <StatusBadge status={booking.status} />
              </div>
              {booking.status === 'booked' ? (
                <Button size="sm" onClick={() => markCollected(booking._id)}>
                  Mark sample collected
                </Button>
              ) : null}
              {booking.status === 'sample_collected' ? (
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-2">
                  <Upload className="size-3.5" />
                  {uploadingId === booking._id ? 'Uploading…' : 'Upload report (PDF)'}
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
              {booking.status === 'report_ready' ? (
                <p className="inline-flex items-center gap-1.5 text-sm text-green-700">
                  <CheckCircle2 className="size-3.5" /> Report uploaded
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
