'use client';

import { useListMyReferralsQuery } from '@/store/labReferralsApi';
import { FloatingIcon3D } from '@/components/ui/floating-icon-3d';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent } from '@/components/ui/card';

export default function DoctorReferralsPage() {
  const { data, isLoading } = useListMyReferralsQuery();

  if (isLoading) return <main className="max-w-2xl mx-auto mt-12">Loading...</main>;

  return (
    <main className="w-full mt-12 space-y-4 px-8">
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <FloatingIcon3D src="/icons-3d/microscope.png" size={160} alt="" />
        </div>
        <h1 className="text-2xl font-bold">Lab Referrals Sent</h1>
      </div>
      {data?.items.length === 0 ? <EmptyState icon="/icons-3d/microscope.png" message="No referrals sent yet." /> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data?.items.map((referral) => (
          <Card key={referral._id}>
            <CardContent className="space-y-2">
              <p className="text-lg font-medium">{referral.labName ?? 'Lab'}{referral.labCity ? ` — ${referral.labCity}` : ''}</p>
              <p className="text-sm text-muted-foreground">Tests: {referral.suggestedTestCodes.join(', ')}</p>
              <StatusBadge status={referral.status} />
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
