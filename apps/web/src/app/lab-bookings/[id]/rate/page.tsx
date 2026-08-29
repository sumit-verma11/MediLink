'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, Star } from 'lucide-react';
import { useCreateLabRatingMutation } from '@/store/ratingsApi';
import { useListMyLabBookingsAsPatientQuery } from '@/store/labBookingsApi';
import { useGetPublicLabProfileQuery } from '@/store/labsApi';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { BackLink } from '@/components/ui/back-link';
import { cn, apiErrorMessage } from '@/lib/utils';

export default function RateLabBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [score, setScore] = useState(5);
  const [text, setText] = useState('');
  const [createLabRating, { isLoading, error }] = useCreateLabRatingMutation();

  // Same reasoning as the doctor rate page: no single-booking GET endpoint, so find it
  // client-side from the patient's own booking list.
  const { data: bookingsData } = useListMyLabBookingsAsPatientQuery();
  const booking = bookingsData?.items.find((b) => b._id === id);
  const { data: labData } = useGetPublicLabProfileQuery(booking?.labId ?? '', { skip: !booking?.labId });
  const lab = labData?.profile;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createLabRating({ bookingId: id, score, text: text || undefined }).unwrap();
      router.push('/dashboard/patient/timeline');
    } catch {
      // error state is already tracked by the mutation hook and rendered below
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16 md:px-16">
      <BackLink href="/dashboard/patient/timeline" label="Back to health timeline" />
      <Card className="p-7">
        <CardHeader className="gap-1.5 px-0">
          <CardTitle className="text-2xl font-semibold">Rate this lab</CardTitle>
          <CardDescription>How was your test experience? Your feedback helps other patients.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {lab ? (
            <div className="mb-5 flex items-center gap-3 rounded-lg bg-muted p-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
                <FlaskConical className="size-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{lab.labName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {booking ? booking.testCodes.join(', ') : lab.city}
                </p>
              </div>
            </div>
          ) : (
            <Skeleton className="mb-5 h-16 rounded-lg" />
          )}
          <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Score</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setScore(n)}
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    className="p-0.5"
                  >
                    <Star className={cn('size-7', n <= score ? 'fill-accent text-accent' : 'text-border')} />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="comment" className="text-sm font-medium text-foreground">
                Comment (optional)
              </label>
              <textarea
                id="comment"
                className="min-h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={1000}
                placeholder="Fast turnaround, accurate report."
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive">{apiErrorMessage(error, 'Could not submit rating. Please try again.')}</p>
            ) : null}
            <Button type="submit" disabled={isLoading} size="lg" className="w-full">
              {isLoading ? 'Submitting…' : 'Submit rating'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
