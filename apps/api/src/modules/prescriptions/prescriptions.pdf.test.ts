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
});
