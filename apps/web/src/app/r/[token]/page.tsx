'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import { useGetReferralByTokenQuery } from '@/store/labReferralsApi';
import { useCreateBookingMutation } from '@/store/labBookingsApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

export default function ReferralLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { data, isLoading, isError } = useGetReferralByTokenQuery(token);
  const [scheduledAt, setScheduledAt] = useState('');
  const [homeCollection, setHomeCollection] = useState(false);
  const [createBooking, { isLoading: isBooking, error }] = useCreateBookingMutation();

  if (isLoading) {
    return (
      <main className="mx-auto max-w-xl space-y-6 px-6 py-16 md:px-16">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </main>
    );
  }
  if (isError || !data) return <main className="mx-auto max-w-xl px-6 py-16 md:px-16">This referral link is invalid or expired.</main>;

  async function onBook() {
    if (!scheduledAt) return;
    try {
      await createBooking({
        labId: data!.referral.labId,
        testCodes: data!.tests.map((t) => t.code),
        scheduledAt,
        homeCollection,
        referralToken: token,
      }).unwrap();
      router.push('/dashboard/patient/timeline');
    } catch {
      // error state below already reflects the failure
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-6 py-16 md:px-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{data.lab.labName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data.lab.city}</p>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Referred tests</p>
          <ul className="space-y-1.5">
            {data.tests.map((t) => (
              <li key={t.code} className="flex items-center justify-between text-sm text-foreground">
                <span className="flex items-center gap-2">
                  <FlaskConical className="size-3.5 text-primary" /> {t.name}
                </span>
                <span className="font-medium">₹{t.price}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-semibold text-foreground">
            <span>Total</span>
            <span>₹{data.totalPrice}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="p-7">
        <CardContent className="space-y-5 px-0">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="scheduledAt" className="text-sm font-medium text-foreground">
              Preferred date &amp; time
            </label>
            <Input id="scheduledAt" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>

          {data.lab.homeCollection ? (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={homeCollection} onChange={(e) => setHomeCollection(e.target.checked)} className="size-4 rounded border-input" />
              Home collection
            </label>
          ) : null}

          {error ? <p className="text-sm text-destructive">Something went wrong. Please try again.</p> : null}
          <Button size="lg" className="w-full" disabled={isBooking} onClick={onBook}>
            {isBooking ? 'Booking…' : 'Book now'}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
