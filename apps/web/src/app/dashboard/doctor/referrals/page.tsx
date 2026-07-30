'use client';

import { useListMyReferralsQuery } from '@/store/labReferralsApi';

export default function DoctorReferralsPage() {
  const { data, isLoading } = useListMyReferralsQuery();

  if (isLoading) return <main className="max-w-2xl mx-auto mt-12">Loading...</main>;

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Lab Referrals Sent</h1>
      <ul className="space-y-2">
        {data?.items.map((referral) => (
          <li key={referral._id} className="border p-3 rounded">
            <p>Tests: {referral.suggestedTestCodes.join(', ')}</p>
            <p className="text-sm text-gray-600">Status: {referral.status}</p>
          </li>
        ))}
      </ul>
      {data?.items.length === 0 ? <p className="text-sm text-gray-600">No referrals sent yet.</p> : null}
    </main>
  );
}
