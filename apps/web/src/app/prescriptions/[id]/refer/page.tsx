'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateReferralMutation } from '@/store/labReferralsApi';
import { useListMyPrescriptionsQuery } from '@/store/prescriptionsApi';

export default function ReferToLabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: prescriptionId } = use(params);
  const router = useRouter();
  const [labId, setLabId] = useState('');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const { data } = useListMyPrescriptionsQuery({ page: 1, limit: 50 });
  const prescription = data?.items.find((p) => p._id === prescriptionId);
  const [createReferral, { isLoading, error }] = useCreateReferralMutation();

  async function onSubmit() {
    if (!labId || selectedCodes.length === 0) return;
    try {
      await createReferral({ prescriptionId, labId, testCodes: selectedCodes }).unwrap();
      router.push('/dashboard/doctor');
    } catch {
      // error state below already reflects the failure
    }
  }

  return (
    <main className="max-w-xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Refer to a Lab</h1>
      <p className="text-sm text-gray-600">Recommended tests: {prescription?.recommendedTests.map((t) => t.testName).join(', ') || 'none'}</p>

      <div>
        <label className="block text-sm font-medium">Lab ID</label>
        <input className="border p-2 w-full" value={labId} onChange={(e) => setLabId(e.target.value)} placeholder="Paste the lab's profile id" />
      </div>

      <div>
        <label className="block text-sm font-medium">Test codes to refer (comma-separated, e.g. CBC,LFT)</label>
        <input
          className="border p-2 w-full"
          onChange={(e) => setSelectedCodes(e.target.value.split(',').map((c) => c.trim()).filter(Boolean))}
        />
      </div>

      <button className="bg-black text-white px-4 py-2" disabled={isLoading} onClick={onSubmit}>
        {isLoading ? 'Sending...' : 'Send Referral'}
      </button>
      {error ? <p className="text-sm text-red-600">Something went wrong — check the lab id and test codes.</p> : null}

      <button className="text-sm underline block" onClick={() => router.push('/dashboard/doctor')}>
        Skip (no lab referral)
      </button>
    </main>
  );
}
