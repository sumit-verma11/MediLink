'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateRatingMutation } from '@/store/ratingsApi';

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
    <main className="max-w-md mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Rate your appointment</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          Score (1-5)
          <select className="border rounded w-full p-2 mt-1" value={score} onChange={(e) => setScore(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="block">
          Comment (optional)
          <textarea className="border rounded w-full p-2 mt-1" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
        </label>
        {error ? <p className="text-sm text-red-600">Could not submit rating — it may already be rated.</p> : null}
        <button type="submit" disabled={isLoading} className="border px-3 py-1 rounded">
          {isLoading ? 'Submitting…' : 'Submit rating'}
        </button>
      </form>
    </main>
  );
}
