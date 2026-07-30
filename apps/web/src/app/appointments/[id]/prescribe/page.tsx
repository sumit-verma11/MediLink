'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GENERIC_MEDICINES } from '@medlink/shared';
import { useCreatePrescriptionMutation, type Medicine } from '@/store/prescriptionsApi';

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
        router.push(`/prescriptions/${result.prescription._id}/refer`);
      } else {
        router.push('/dashboard/doctor');
      }
    } catch {
      // error state below already reflects the failure
    }
  }

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Write Prescription</h1>

      <div>
        <label className="block text-sm font-medium">Diagnosis</label>
        <textarea className="border p-2 w-full" value={diagnosisNote} onChange={(e) => setDiagnosisNote(e.target.value)} />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Medicines</label>
        {medicines.map((med, i) => (
          <div key={i} className="grid grid-cols-4 gap-2">
            <input
              className="border p-2"
              list="medicine-options"
              placeholder="Name"
              value={med.name}
              onChange={(e) => updateMedicine(i, 'name', e.target.value)}
            />
            <input className="border p-2" placeholder="Dosage" value={med.dosage} onChange={(e) => updateMedicine(i, 'dosage', e.target.value)} />
            <input className="border p-2" placeholder="Frequency" value={med.frequency} onChange={(e) => updateMedicine(i, 'frequency', e.target.value)} />
            <input
              className="border p-2"
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
        <button type="button" className="text-sm underline" onClick={addMedicineRow}>
          + Add medicine
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium">Advice</label>
        <textarea className="border p-2 w-full" value={advice} onChange={(e) => setAdvice(e.target.value)} />
      </div>

      <div>
        <label className="block text-sm font-medium">Follow-up date (optional)</label>
        <input type="date" className="border p-2" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
      </div>

      <div>
        <label className="block text-sm font-medium">Recommended tests (comma-separated, optional)</label>
        <input className="border p-2 w-full" value={recommendedTestsText} onChange={(e) => setRecommendedTestsText(e.target.value)} />
      </div>

      <button className="bg-black text-white px-4 py-2" disabled={isLoading} onClick={onSubmit}>
        {isLoading ? 'Saving...' : 'Save Prescription'}
      </button>
      {error ? <p className="text-sm text-red-600">Something went wrong — please try again.</p> : null}
    </main>
  );
}
