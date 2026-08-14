'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { GENERIC_MEDICINES } from '@medlink/shared';
import { useCreatePrescriptionMutation, type Medicine } from '@/store/prescriptionsApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function PrescribePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: appointmentId } = use(params);
  const router = useRouter();
  const [diagnosisNote, setDiagnosisNote] = useState('');
  const [advice, setAdvice] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [recommendedTestsText, setRecommendedTestsText] = useState('');
  const [medicines, setMedicines] = useState<Medicine[]>([
    { name: '', dosage: '', frequency: '', durationDays: 5, instructions: '' },
  ]);
  const [createPrescription, { isLoading, error }] = useCreatePrescriptionMutation();

  function updateMedicine(index: number, field: keyof Medicine, value: string) {
    setMedicines((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: field === 'durationDays' ? Number(value) : value } : m))
    );
  }

  function addMedicineRow() {
    setMedicines((prev) => [...prev, { name: '', dosage: '', frequency: '', durationDays: 5, instructions: '' }]);
  }

  async function onSubmit() {
    const recommendedTests = recommendedTestsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((testName) => ({ testName }));

    try {
      const result = await createPrescription({
        appointmentId,
        diagnosisNote,
        medicines,
        advice,
        followUpDate: followUpDate || undefined,
        recommendedTests,
      }).unwrap();

      if (recommendedTests.length > 0) {
        const testNames = recommendedTests.map((t) => t.testName).join(',');
        router.push(`/prescriptions/${result.prescription._id}/refer?tests=${encodeURIComponent(testNames)}`);
      } else {
        router.push('/dashboard/doctor');
      }
    } catch {
      // error state below already reflects the failure
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-16 md:px-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Write prescription</h1>
        <p className="mt-1 text-muted-foreground">This becomes a permanent, verifiable record.</p>
      </div>

      <Card>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="diagnosis" className="text-sm font-medium text-foreground">
              Diagnosis
            </label>
            <textarea
              id="diagnosis"
              className="min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={diagnosisNote}
              onChange={(e) => setDiagnosisNote(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">Medicines</span>
            {medicines.map((med, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Input list="medicine-options" placeholder="Name" value={med.name} onChange={(e) => updateMedicine(i, 'name', e.target.value)} />
                <Input placeholder="Dosage" value={med.dosage} onChange={(e) => updateMedicine(i, 'dosage', e.target.value)} />
                <Input placeholder="Frequency" value={med.frequency} onChange={(e) => updateMedicine(i, 'frequency', e.target.value)} />
                <Input type="number" placeholder="Days" value={med.durationDays} onChange={(e) => updateMedicine(i, 'durationDays', e.target.value)} />
              </div>
            ))}
            <datalist id="medicine-options">
              {GENERIC_MEDICINES.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <button type="button" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-foreground underline underline-offset-2" onClick={addMedicineRow}>
              <Plus className="size-3.5" /> Add medicine
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="advice" className="text-sm font-medium text-foreground">
              Advice
            </label>
            <textarea
              id="advice"
              className="min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={advice}
              onChange={(e) => setAdvice(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="followup" className="text-sm font-medium text-foreground">
                Follow-up date (optional)
              </label>
              <Input id="followup" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tests" className="text-sm font-medium text-foreground">
                Recommended tests (optional)
              </label>
              <Input id="tests" placeholder="CBC, LFT" value={recommendedTestsText} onChange={(e) => setRecommendedTestsText(e.target.value)} />
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">Something went wrong. Please try again.</p> : null}
          <Button disabled={isLoading} onClick={onSubmit} size="lg" className="w-full">
            {isLoading ? 'Saving…' : 'Save prescription'}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
