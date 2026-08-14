'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { useCreateRatingMutation } from '@/store/ratingsApi';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function RateAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [score, setScore] = useState(5);
  const [text, setText] = useState('');
  const [createRating, { isLoading, error }] = useCreateRatingMutation();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createRating({ appointmentId: id, score, text: text || undefined }).unwrap();
    router.push('/dashboard/patient');
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16 md:px-16">
      <Card className="p-7">
        <CardHeader className="gap-1.5 px-0">
          <CardTitle className="text-2xl font-semibold">Rate your appointment</CardTitle>
          <CardDescription>How did it go? Your feedback helps other patients.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
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
                placeholder="Very patient, explained everything clearly."
              />
            </div>
            {error ? <p className="text-sm text-destructive">Could not submit rating. It may already be rated.</p> : null}
            <Button type="submit" disabled={isLoading} size="lg" className="w-full">
              {isLoading ? 'Submitting…' : 'Submit rating'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
