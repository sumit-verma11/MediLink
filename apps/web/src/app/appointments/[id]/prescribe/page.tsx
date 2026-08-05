'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GENERIC_MEDICINES } from '@medlink/shared';
import { useCreatePrescriptionMutation, type Medicine } from '@/store/prescriptionsApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const textareaClassName =
  'mt-1 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

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
    <main className="max-w-3xl mx-auto mt-12 px-6 space-y-4">
      <h1 className="font-heading text-4xl font-semibold">Write Prescription</h1>

      <Card>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Diagnosis</label>
            <textarea className={textareaClassName} value={diagnosisNote} onChange={(e) => setDiagnosisNote(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Medicines</label>
            {medicines.map((med, i) => (
              <div key={i} className="grid grid-cols-4 gap-2">
                <Input
                  list="medicine-options"
                  placeholder="Name"
                  value={med.name}
                  onChange={(e) => updateMedicine(i, 'name', e.target.value)}
                />
                <Input placeholder="Dosage" value={med.dosage} onChange={(e) => updateMedicine(i, 'dosage', e.target.value)} />
                <Input placeholder="Frequency" value={med.frequency} onChange={(e) => updateMedicine(i, 'frequency', e.target.value)} />
                <Input
                  type="number"
                  placeholder="Days"
                  value={med.durationDays}
                  onChange={(e) => updateMedicine(i, 'durationDays', e.target.value)}
                />
              </div>
            ))}
            <datalist id="medicine-options">
              {GENERIC_MEDICINES.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <Button type="button" size="sm" variant="outline" onClick={addMedicineRow}>
              + Add medicine
            </Button>
          </div>

          <div>
            <label className="block text-sm font-medium">Advice</label>
            <textarea className={textareaClassName} value={advice} onChange={(e) => setAdvice(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium">Follow-up date (optional)</label>
            <Input type="date" className="w-auto" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium">Recommended tests (comma-separated, optional)</label>
            <Input value={recommendedTestsText} onChange={(e) => setRecommendedTestsText(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Button disabled={isLoading} onClick={onSubmit}>
        {isLoading ? 'Saving...' : 'Save Prescription'}
      </Button>
      {error ? <p className="text-sm text-destructive">Something went wrong — please try again.</p> : null}
    </main>
  );
}
