'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateBookingMutation } from '@/store/labBookingsApi';

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
    <main className="max-w-xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Book a Test</h1>

      <div>
        <label className="block text-sm font-medium">Test codes (comma-separated, e.g. CBC,LFT)</label>
        <input className="border p-2 w-full" value={testCodesText} onChange={(e) => setTestCodesText(e.target.value)} />
      </div>

      <div>
        <label className="block text-sm font-medium">Preferred date/time</label>
        <input type="datetime-local" className="border p-2" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={homeCollection} onChange={(e) => setHomeCollection(e.target.checked)} />
        Home collection (if offered by this lab)
      </label>

      <button className="bg-black text-white px-4 py-2" disabled={isLoading} onClick={onBook}>
        {isLoading ? 'Booking...' : 'Book Now'}
      </button>
      {error ? <p className="text-sm text-red-600">Something went wrong — please check the test codes and try again.</p> : null}
    </main>
  );
}
