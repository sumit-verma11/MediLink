'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateBookingMutation } from '@/store/labBookingsApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function WalkInBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: labId } = use(params);
  const router = useRouter();
  const [testCodesText, setTestCodesText] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [homeCollection, setHomeCollection] = useState(false);
  const [createBooking, { isLoading, error }] = useCreateBookingMutation();

  async function onBook() {
    const testCodes = testCodesText.split(',').map((c) => c.trim()).filter(Boolean);
    if (testCodes.length === 0 || !scheduledAt) return;
    try {
      await createBooking({ labId, testCodes, scheduledAt, homeCollection }).unwrap();
      router.push('/dashboard/patient/timeline');
    } catch {
      // error state below already reflects the failure
    }
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-16 md:px-16">
      <Card className="p-7">
        <CardContent className="space-y-5 px-0">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Book a test</h1>
            <p className="mt-1 text-sm text-muted-foreground">Walk-in booking, no referral needed.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="testCodes" className="text-sm font-medium text-foreground">
              Test codes
            </label>
            <Input id="testCodes" placeholder="CBC, LFT" value={testCodesText} onChange={(e) => setTestCodesText(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="scheduledAt" className="text-sm font-medium text-foreground">
              Preferred date &amp; time
            </label>
            <Input id="scheduledAt" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={homeCollection} onChange={(e) => setHomeCollection(e.target.checked)} className="size-4 rounded border-input" />
            Home collection (if offered by this lab)
          </label>

          {error ? <p className="text-sm text-destructive">Something went wrong. Please check the test codes and try again.</p> : null}
          <Button size="lg" className="w-full" disabled={isLoading} onClick={onBook}>
            {isLoading ? 'Booking…' : 'Book now'}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
