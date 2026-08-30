import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import {
  mapPatient,
  mapAppointment,
  mapMedicationRequests,
  mapServiceRequest,
  mapDiagnosticReport,
} from './fhirExport.mapper';
import type { IUser } from '../../models/User';
import type { IPatientProfile } from '../../models/PatientProfile';
import type { IAppointment } from '../../models/Appointment';
import type { IPrescription } from '../../models/Prescription';
import type { ILabReferral } from '../../models/LabReferral';
import type { ILabBooking } from '../../models/LabBooking';

describe('mapPatient', () => {
  it('emits resourceType Patient with _ageYears instead of a fabricated birthDate', () => {
    const result = mapPatient(
      { _id: new Types.ObjectId(), name: 'Rahul Sharma' } as IUser,
      { age: 34, gender: 'male' } as IPatientProfile
    );
    expect(result.resourceType).toBe('Patient');
    expect(result.name).toEqual([{ text: 'Rahul Sharma' }]);
    expect(result.gender).toBe('male');
    expect(result.birthDate).toBeUndefined();
    expect(result._ageYears).toBe(34);
  });
});

describe('mapAppointment', () => {
  it.each([
    ['requested', 'pending'],
    ['confirmed', 'booked'],
    ['completed', 'fulfilled'],
    ['cancelled', 'cancelled'],
    ['rejected', 'cancelled'],
    ['no_show', 'noshow'],
  ])('maps MedLink status %s to FHIR status %s', (medlinkStatus, fhirStatus) => {
    const appt = {
      _id: new Types.ObjectId(),
      status: medlinkStatus,
      slotStart: new Date('2026-01-01T10:00:00Z'),
      slotEnd: new Date('2026-01-01T10:15:00Z'),
    } as IAppointment;
    const result = mapAppointment(appt, { doctorDisplay: 'Dr. A', patientDisplay: 'P' });
    expect(result.resourceType).toBe('Appointment');
    expect(result.status).toBe(fhirStatus);
  });
});

describe('mapMedicationRequests', () => {
  it('emits one MedicationRequest per medicine, status stopped when superseded', () => {
    const rx = {
      _id: new Types.ObjectId(),
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 3 }],
      supersededBy: new Types.ObjectId(),
      createdAt: new Date(),
      diagnosisNote: 'Fever',
    } as IPrescription;
    const [result] = mapMedicationRequests(rx, { doctorDisplay: 'Dr. A' });
    expect(result!.resourceType).toBe('MedicationRequest');
    expect(result!.status).toBe('stopped');
    expect(result!.medicationCodeableConcept).toEqual({ text: 'Paracetamol' });
  });
});

describe('mapServiceRequest', () => {
  it.each([
    ['sent', 'active'],
    ['opened', 'active'],
    ['booked', 'active'],
    ['sample_collected', 'active'],
    ['report_ready', 'completed'],
    ['closed', 'completed'],
  ])('maps LabReferral status %s to ServiceRequest status %s', (medlinkStatus, fhirStatus) => {
    const referral = {
      _id: new Types.ObjectId(),
      status: medlinkStatus,
      suggestedTestCodes: ['CBC'],
      timeline: [{ status: 'sent', at: new Date() }],
    } as ILabReferral;
    const result = mapServiceRequest(referral, { doctorDisplay: 'Dr. A', labDisplay: 'HealthFirst' });
    expect(result.resourceType).toBe('ServiceRequest');
    expect(result.status).toBe(fhirStatus);
  });
});

describe('mapDiagnosticReport', () => {
  it('is final status with a presentedForm url', () => {
    const booking = {
      _id: new Types.ObjectId(),
      testCodes: ['CBC', 'LFT'],
      scheduledAt: new Date(),
      reportUrl: '/uploads/report.pdf',
    } as ILabBooking;
    const result = mapDiagnosticReport(booking);
    expect(result.resourceType).toBe('DiagnosticReport');
    expect(result.status).toBe('final');
    expect(result.presentedForm).toEqual([{ url: '/uploads/report.pdf' }]);
  });
});
