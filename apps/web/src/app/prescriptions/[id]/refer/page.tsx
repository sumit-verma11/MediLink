'use client';

import { use, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCreateReferralMutation } from '@/store/labReferralsApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BackLink } from '@/components/ui/back-link';
import { apiErrorMessage } from '@/lib/utils';

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
    <main className="mx-auto max-w-xl px-6 py-16 md:px-16">
      <BackLink href="/dashboard/doctor" label="Back to dashboard" />
      <Card className="p-7">
        <CardContent className="space-y-5 px-0">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Refer to a lab</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Recommended tests: {recommendedTestNames.join(', ') || 'none'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="labId" className="text-sm font-medium text-foreground">
              Lab ID
            </label>
            <Input id="labId" value={labId} onChange={(e) => setLabId(e.target.value)} placeholder="Paste the lab's profile id" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="testCodes" className="text-sm font-medium text-foreground">
              Test codes to refer
            </label>
            <Input
              id="testCodes"
              placeholder="CBC, LFT"
              onChange={(e) => setSelectedCodes(e.target.value.split(',').map((c) => c.trim()).filter(Boolean))}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{apiErrorMessage(error, 'Something went wrong. Check the lab id and test codes.')}</p> : null}
          <Button size="lg" className="w-full" disabled={isLoading} onClick={onSubmit}>
            {isLoading ? 'Sending…' : 'Send referral'}
          </Button>

          <button
            className="w-full text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => router.push('/dashboard/doctor')}
          >
            Skip (no lab referral)
          </button>
        </CardContent>
      </Card>
    </main>
  );
}
