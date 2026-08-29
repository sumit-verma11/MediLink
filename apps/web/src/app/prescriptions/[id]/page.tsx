'use client';

import { use } from 'react';
import { Download, TriangleAlert, ClipboardPlus, FlaskConical } from 'lucide-react';
import { useListMyPrescriptionsQuery } from '@/store/prescriptionsApi';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BackLink } from '@/components/ui/back-link';
import { cn } from '@/lib/utils';

export default function PrescriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // There is no single-prescription GET endpoint (only /me, a list) --
  // find it client-side from the patient's own list, which is small enough
  // (a handful of prescriptions per patient in this project's scale) that a
  // dedicated single-item endpoint isn't justified yet (YAGNI).
  const { data, isLoading } = useListMyPrescriptionsQuery({ page: 1, limit: 50 });
  const prescription = data?.items.find((p) => p._id === id);

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl space-y-6 px-6 py-16 md:px-16">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </main>
    );
  }
  if (!prescription) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 md:px-16">
        <BackLink href="/dashboard/patient/timeline" label="Back to health timeline" />
        Prescription not found.
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-16 md:px-16">
      <BackLink href="/dashboard/patient/timeline" label="Back to health timeline" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary">
            <ClipboardPlus className="size-5 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Prescription</h1>
        </div>
        {prescription.pdfUrl ? (
          <a
            className={cn(buttonVariants({ variant: 'accent' }))}
            href={`${process.env.NEXT_PUBLIC_API_URL}/prescriptions/${prescription._id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            <Download className="size-4" /> Download PDF
          </a>
        ) : null}
      </div>

      {prescription.supersededBy ? (
        <Card className="border-amber-200 bg-amber-50 ring-0">
          <CardContent className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <p className="text-sm text-amber-800">This prescription has been amended. A newer version exists.</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-5">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Diagnosis</p>
            <p className="mt-1 text-sm text-foreground">{prescription.diagnosisNote}</p>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">Medicines</p>
            <ul className="mt-2 space-y-2">
              {prescription.medicines.map((m, i) => (
                <li key={i} className="text-sm text-foreground">
                  <span className="font-medium">{m.name}</span> {m.dosage}, {m.frequency}, {m.durationDays} days
                  {m.instructions ? <span className="text-muted-foreground"> ({m.instructions})</span> : null}
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">Advice</p>
            <p className="mt-1 text-sm text-foreground">{prescription.advice}</p>
          </div>

          {prescription.followUpDate ? (
            <div className="border-t border-border pt-4">
              <p className="text-xs font-medium text-muted-foreground">Follow-up</p>
              <p className="mt-1 text-sm text-foreground">{new Date(prescription.followUpDate).toDateString()}</p>
            </div>
          ) : null}

          {prescription.recommendedTests.length > 0 ? (
            <div className="border-t border-border pt-4">
              <p className="text-xs font-medium text-muted-foreground">Recommended tests</p>
              <ul className="mt-2 space-y-1.5">
                {prescription.recommendedTests.map((t, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                    <FlaskConical className="size-3.5 text-primary" />
                    {t.testName}
                    {t.labReferralId ? <span className="text-xs text-green-700">Referred to a lab</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
