'use client';

import { use, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCreateReferralMutation } from '@/store/labReferralsApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ReferToLabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: prescriptionId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  // The doctor who was just redirected here from the prescription composer has
  // no access to GET /prescriptions/me (patient-only), so the composer threads
  // the recommended test names through as a query param instead of this page
  // re-fetching them from an endpoint it's forbidden to call.
  const recommendedTestNames = (searchParams.get('tests') ?? '').split(',').filter(Boolean);
  const [labId, setLabId] = useState('');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
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
      <p className="text-sm text-muted-foreground">Recommended tests: {recommendedTestNames.join(', ') || 'none'}</p>

      <div>
        <label className="block text-sm font-medium">Lab ID</label>
        <Input value={labId} onChange={(e) => setLabId(e.target.value)} placeholder="Paste the lab's profile id" />
      </div>

      <div>
        <label className="block text-sm font-medium">Test codes to refer (comma-separated, e.g. CBC,LFT)</label>
        <Input
          onChange={(e) => setSelectedCodes(e.target.value.split(',').map((c) => c.trim()).filter(Boolean))}
        />
      </div>

      <Button disabled={isLoading} onClick={onSubmit}>
        {isLoading ? 'Sending...' : 'Send Referral'}
      </Button>
      {error ? <p className="text-sm text-destructive">Something went wrong — check the lab id and test codes.</p> : null}

      <Button variant="ghost" onClick={() => router.push('/dashboard/doctor')}>
        Skip (no lab referral)
      </Button>
    </main>
  );
}
