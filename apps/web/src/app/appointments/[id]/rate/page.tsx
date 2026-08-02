'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateRatingMutation } from '@/store/ratingsApi';
import { Button } from '@/components/ui/button';

const fieldClassName =
  'mt-1 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

export default function RateAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [score, setScore] = useState(5);
  const [text, setText] = useState('');
  const [createRating, { isLoading, error }] = useCreateRatingMutation();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createRating({ appointmentId: id, score, text: text || undefined }).unwrap();
      router.push('/dashboard/patient');
    } catch {
      // `error` from useCreateRatingMutation already drives the message below.
    }
  }

  return (
    <main className="max-w-xl mx-auto mt-12 px-6 space-y-4">
      <h1 className="text-4xl font-extrabold tracking-tight">Rate your appointment</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          Score (1-5)
          <select className={fieldClassName} value={score} onChange={(e) => setScore(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="block">
          Comment (optional)
          <textarea className={fieldClassName} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
        </label>
        {error ? <p className="text-sm text-destructive">Could not submit rating — it may already be rated.</p> : null}
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Submitting…' : 'Submit rating'}
        </Button>
      </form>
    </main>
  );
}
