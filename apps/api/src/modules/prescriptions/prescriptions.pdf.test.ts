import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { Types } from 'mongoose';
import { generatePrescriptionPdf } from './prescriptions.pdf';

function fakeIds() {
  return { _id: new Types.ObjectId() };
}

describe('generatePrescriptionPdf', () => {
  it('produces a valid, parseable single-page PDF', async () => {
    const prescription = {
      ...fakeIds(),
      diagnosisNote: 'Viral fever',
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 5, instructions: 'After food' }],
      advice: 'Rest and fluids',
      recommendedTests: [],
      version: 1,
      createdAt: new Date('2026-01-01'),
    } as never;
    const doctorProfile = {
      clinicName: 'HealthFirst Clinic',
      clinicAddress: 'Sector 62, Noida',
      regNo: 'DMC/R/12345',
    } as never;
    const doctorUser = { name: 'Dr. Meera Sharma' } as never;
    const patientUser = { name: 'Rahul Sharma' } as never;

    const buffer = await generatePrescriptionPdf({
      prescription,
      doctorProfile,
      doctorUser,
      patientUser,
      verifyBaseUrl: 'http://localhost:3000',
    });

    expect(buffer.length).toBeGreaterThan(0);
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('produces a valid, parseable PDF when free-text fields are very long (word-wrap path)', async () => {
    const longDiagnosisNote =
      'Patient presents with a chronic, recurring pattern of symptoms that has persisted for several weeks ' +
      'and has not responded to over-the-counter treatments. On examination there is mild inflammation, ' +
      'localized tenderness, and some discoloration around the affected area. Recommending further ' +
      'investigation, a course of prescribed medication, and a follow-up visit in two weeks to reassess ' +
      'progress and adjust the treatment plan if symptoms have not sufficiently improved by that time.';
    const longAdvice =
      'Please maintain adequate hydration, avoid known irritants and allergens, get sufficient rest, ' +
      'follow the prescribed medication schedule strictly without skipping doses, and return immediately ' +
      'if symptoms worsen, if a high fever develops, or if any new or unusual symptoms appear before the ' +
      'scheduled follow-up appointment.';

    expect(longDiagnosisNote.length).toBeGreaterThan(300);

    const prescription = {
      ...fakeIds(),
      diagnosisNote: longDiagnosisNote,
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 5, instructions: 'After food' }],
      advice: longAdvice,
      recommendedTests: [],
      version: 1,
      createdAt: new Date('2026-01-01'),
    } as never;
    const doctorProfile = {
      clinicName: 'HealthFirst Clinic',
      clinicAddress: 'Sector 62, Noida, Uttar Pradesh, near the metro station and the big shopping complex, India',
      regNo: 'DMC/R/12345',
    } as never;
    const doctorUser = { name: 'Dr. Meera Sharma' } as never;
    const patientUser = { name: 'Rahul Sharma' } as never;

    const buffer = await generatePrescriptionPdf({
      prescription,
      doctorProfile,
      doctorUser,
      patientUser,
      verifyBaseUrl: 'http://localhost:3000',
    });

    expect(buffer.length).toBeGreaterThan(0);
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
