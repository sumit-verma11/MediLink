'use client';

import { use } from 'react';
import { useListMyPrescriptionsQuery } from '@/store/prescriptionsApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export default function PrescriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // There is no single-prescription GET endpoint (only /me, a list) --
  // find it client-side from the patient's own list, which is small enough
  // (a handful of prescriptions per patient in this project's scale) that a
  // dedicated single-item endpoint isn't justified yet (YAGNI).
  const { data, isLoading } = useListMyPrescriptionsQuery({ page: 1, limit: 50 });
  const prescription = data?.items.find((p) => p._id === id);

  if (isLoading) return <main className="max-w-2xl mx-auto mt-12">Loading...</main>;
  if (!prescription) return <main className="max-w-2xl mx-auto mt-12">Prescription not found.</main>;

  return (
    <main className="max-w-3xl mx-auto mt-12 space-y-4 px-6">
      <h1 className="text-4xl font-extrabold tracking-tight">Prescription</h1>
      {prescription.supersededBy ? (
        <p className="text-sm text-amber-700">This prescription has been amended — a newer version exists.</p>
      ) : null}
      <Card>
        <CardContent className="space-y-3">
          <p><strong>Diagnosis:</strong> {prescription.diagnosisNote}</p>
          <div>
            <strong>Medicines:</strong>
            <ul className="list-disc pl-6">
              {prescription.medicines.map((m, i) => (
                <li key={i}>{m.name} {m.dosage}, {m.frequency}, {m.durationDays} days{m.instructions ? ` (${m.instructions})` : ''}</li>
              ))}
            </ul>
          </div>
          <p><strong>Advice:</strong> {prescription.advice}</p>
          {prescription.followUpDate ? <p><strong>Follow-up:</strong> {new Date(prescription.followUpDate).toDateString()}</p> : null}
          {prescription.recommendedTests.length > 0 ? (
            <div>
              <strong>Recommended Tests:</strong>
              <ul className="list-disc pl-6">
                {prescription.recommendedTests.map((t, i) => (
                  <li key={i}>
                    {t.testName}
                    {t.labReferralId ? <span className="text-sm text-green-700"> (referred to a lab)</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {prescription.pdfUrl ? (
        <Button
          nativeButton={false}
          render={
            <a href={`${API_BASE}/prescriptions/${prescription._id}/pdf`} target="_blank" rel="noreferrer" />
          }
        >
          Download PDF
        </Button>
      ) : null}
    </main>
  );
}
