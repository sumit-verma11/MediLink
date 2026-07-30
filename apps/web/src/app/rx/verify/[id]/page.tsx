'use client';

import { use } from 'react';
import { useGetPublicVerificationQuery } from '@/store/prescriptionsApi';

export default function VerifyPrescriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, isError } = useGetPublicVerificationQuery(id);

  if (isLoading) return <main className="max-w-md mx-auto mt-12">Checking...</main>;
  if (isError || !data) {
    return (
      <main className="max-w-md mx-auto mt-12">
        <p className="text-red-600">This prescription could not be verified.</p>
      </main>
    );
  }

  const { verification } = data;

  return (
    <main className="max-w-md mx-auto mt-12 space-y-3 border p-6 rounded">
      <h1 className="text-xl font-bold text-green-700">✓ Valid Prescription</h1>
      <p><strong>Issued by:</strong> {verification.doctorName}</p>
      <p><strong>Registration No:</strong> {verification.regNo}</p>
      <p><strong>Clinic:</strong> {verification.clinicName}</p>
      <p><strong>Issued on:</strong> {new Date(verification.issuedAt).toDateString()}</p>
      {!verification.isLatestVersion ? (
        <p className="text-amber-700 text-sm">Note: this prescription has since been amended by the doctor.</p>
      ) : null}
      <p className="text-xs text-gray-500">
        This page confirms the prescription's authenticity only. Diagnosis and medication details are not shown here for patient privacy.
      </p>
    </main>
  );
}
