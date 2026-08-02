'use client';

import { use } from 'react';
import { useGetPublicVerificationQuery } from '@/store/prescriptionsApi';
import { Card, CardContent } from '@/components/ui/card';

export default function VerifyPrescriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, isError } = useGetPublicVerificationQuery(id);

  if (isLoading) return <main className="max-w-md mx-auto mt-12">Checking...</main>;
  if (isError || !data) {
    return (
      <main className="max-w-md mx-auto mt-12">
        <p className="text-destructive">This prescription could not be verified.</p>
      </main>
    );
  }

  const { verification } = data;

  return (
    <main className="max-w-md mx-auto mt-12">
      <Card>
        <CardContent className="space-y-3">
          <h1 className="text-4xl font-extrabold tracking-tight text-green-700">✓ Valid Prescription</h1>
          <p><strong>Issued by:</strong> {verification.doctorName}</p>
          <p><strong>Registration No:</strong> {verification.regNo}</p>
          <p><strong>Clinic:</strong> {verification.clinicName}</p>
          <p><strong>Issued on:</strong> {new Date(verification.issuedAt).toDateString()}</p>
          {!verification.isLatestVersion ? (
            <p className="text-sm text-amber-700">Note: this prescription has since been amended by the doctor.</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            This page confirms the prescription&apos;s authenticity only. Diagnosis and medication details are not shown here for patient privacy.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
