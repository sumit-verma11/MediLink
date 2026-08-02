'use client';

import { use, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCreateReferralMutation } from '@/store/labReferralsApi';
import { useSearchLabsQuery } from '@/store/searchApi';
import { Card, CardContent } from '@/components/ui/card';
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
  const { data: labResults } = useSearchLabsQuery({ testName: recommendedTestNames[0] });
  const [labId, setLabId] = useState('');
  const [selectedLabName, setSelectedLabName] = useState('');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [createReferral, { isLoading, error }] = useCreateReferralMutation();

  function pickLab(lab: NonNullable<typeof labResults>['items'][number]) {
    setLabId(lab._id);
    setSelectedLabName(lab.labName);
    // Best-effort match of each recommended test name against this lab's catalog,
    // so picking a lab auto-fills the codes instead of requiring the doctor to
    // look them up and type them in.
    const matchedCodes = recommendedTestNames
      .map((name) => lab.tests.find((t) => t.name.toLowerCase().includes(name.toLowerCase()))?.code)
      .filter((code): code is string => Boolean(code));
    setSelectedCodes(matchedCodes);
  }

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
    <main className="max-w-2xl mx-auto mt-12 px-6 space-y-4">
      <h1 className="text-4xl font-bold">Refer to a Lab</h1>
      <p className="text-sm text-muted-foreground">Recommended tests: {recommendedTestNames.join(', ') || 'none'}</p>

      {labResults && labResults.items.length > 0 ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium">Labs offering these tests</label>
          <div className="grid gap-3 sm:grid-cols-2">
            {labResults.items.map((lab) => (
              <Card
                key={lab._id}
                className={`cursor-pointer ${labId === lab._id ? 'ring-2 ring-primary' : ''}`}
                onClick={() => pickLab(lab)}
              >
                <CardContent>
                  <p className="font-medium">{lab.labName}</p>
                  <p className="text-sm text-muted-foreground">
                    {lab.city}{lab.homeCollection ? ' · home collection' : ''}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {labId ? (
        <p className="text-sm">Selected lab: <strong>{selectedLabName}</strong> — tests: {selectedCodes.join(', ') || 'none matched, enter codes below'}</p>
      ) : null}

      <div>
        <label className="block text-sm font-medium">Lab ID (or pick a lab above)</label>
        <Input value={labId} onChange={(e) => setLabId(e.target.value)} placeholder="Paste the lab's profile id" />
      </div>

      <div>
        <label className="block text-sm font-medium">Test codes to refer (comma-separated, e.g. CBC,LFT)</label>
        <Input
          value={selectedCodes.join(',')}
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
