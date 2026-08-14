'use client';

import { FlaskConical } from 'lucide-react';
import { useListMyReferralsQuery } from '@/store/labReferralsApi';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

export default function DoctorReferralsPage() {
  const { data, isLoading } = useListMyReferralsQuery();

  if (isLoading) {
    return (
      <main className="max-w-2xl space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Lab referrals sent</h1>
        <p className="mt-1 text-muted-foreground">Track whether your patients followed through on referred tests.</p>
      </div>

      {data?.items.length === 0 ? <EmptyState icon="/icons-3d/microscope.png" message="No referrals sent yet." /> : null}

      <div className="space-y-3">
        {data?.items.map((referral) => (
          <Card key={referral._id}>
            <CardContent className="flex items-center gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
                <FlaskConical className="size-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{referral.suggestedTestCodes.join(', ')}</p>
                <div className="mt-1">
                  <StatusBadge status={referral.status} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
