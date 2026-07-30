'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGetReferralByTokenQuery } from '@/store/labReferralsApi';
import { useCreateBookingMutation } from '@/store/labBookingsApi';

export default function ReferralLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { data, isLoading, isError } = useGetReferralByTokenQuery(token);
  const [scheduledAt, setScheduledAt] = useState('');
  const [homeCollection, setHomeCollection] = useState(false);
  const [createBooking, { isLoading: isBooking, error }] = useCreateBookingMutation();

  if (isLoading) return <main className="max-w-xl mx-auto mt-12">Loading...</main>;
  if (isError || !data) return <main className="max-w-xl mx-auto mt-12">This referral link is invalid or expired.</main>;

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
    <main className="max-w-xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">{data.lab.labName}</h1>
      <p className="text-sm text-gray-600">{data.lab.city}</p>

      <div>
        <h2 className="font-semibold">Referred Tests</h2>
        <ul className="list-disc pl-6">
          {data.tests.map((t) => (
            <li key={t.code}>{t.name} — ₹{t.price}</li>
          ))}
        </ul>
        <p className="font-bold mt-2">Total: ₹{data.totalPrice}</p>
      </div>

      <div>
        <label className="block text-sm font-medium">Preferred date/time</label>
        <input type="datetime-local" className="border p-2" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
      </div>

      {data.lab.homeCollection ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={homeCollection} onChange={(e) => setHomeCollection(e.target.checked)} />
          Home collection
        </label>
      ) : null}

      <button className="bg-black text-white px-4 py-2" disabled={isBooking} onClick={onBook}>
        {isBooking ? 'Booking...' : 'Book Now'}
      </button>
      {error ? <p className="text-sm text-red-600">Something went wrong — please try again.</p> : null}
    </main>
  );
}
