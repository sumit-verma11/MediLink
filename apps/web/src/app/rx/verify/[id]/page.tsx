'use client';

import { use } from 'react';
import { ShieldCheck, ShieldX, GraduationCap, Building2, CalendarDays, TriangleAlert } from 'lucide-react';
import { useGetPublicVerificationQuery } from '@/store/prescriptionsApi';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function VerifyPrescriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, isError } = useGetPublicVerificationQuery(id);

  if (isLoading) {
    return (
      <main className="mx-auto max-w-md space-y-6 px-6 py-16 md:px-16">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-48 rounded-xl" />
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 md:px-16">
        <Card className="border-destructive/40 bg-destructive/10 ring-0">
          <CardContent className="flex items-start gap-3">
            <ShieldX className="mt-0.5 size-5 shrink-0 text-destructive" />
            <p className="text-sm font-medium text-destructive">This prescription could not be verified.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const { verification } = data;

  return (
    <main className="mx-auto max-w-md space-y-6 px-6 py-16 md:px-16">
      <div className="flex items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-green-100">
          <ShieldCheck className="size-5 text-green-700" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Valid prescription</h1>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2">
            <GraduationCap className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="text-xs font-medium text-muted-foreground">Issued by</p>
              <p className="text-sm text-foreground">{verification.doctorName}</p>
              <p className="text-xs text-muted-foreground">Reg. No. {verification.regNo}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 border-t border-border pt-4">
            <Building2 className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="text-xs font-medium text-muted-foreground">Clinic</p>
              <p className="text-sm text-foreground">{verification.clinicName}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 border-t border-border pt-4">
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="text-xs font-medium text-muted-foreground">Issued on</p>
              <p className="text-sm text-foreground">{new Date(verification.issuedAt).toDateString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {!verification.isLatestVersion ? (
        <Card className="border-amber-200 bg-amber-50 ring-0">
          <CardContent className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <p className="text-sm text-amber-800">This prescription has since been amended by the doctor.</p>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">
        This page confirms the prescription&apos;s authenticity only. Diagnosis and medication details are not shown here for patient privacy.
      </p>
    </main>
  );
}
