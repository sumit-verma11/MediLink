import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createReferral, getReferralByToken, listReferralsForDoctor } from './labReferrals.service';
import { User } from '../../models/User';
import { DoctorProfile } from '../../models/DoctorProfile';
import { LabProfile } from '../../models/LabProfile';
import { Prescription } from '../../models/Prescription';
import { LabReferral } from '../../models/LabReferral';
import { Notification } from '../../models/Notification';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await LabReferral.init();
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function seedPrescriptionAndLab() {
  const doctorUser = await User.create({ role: 'doctor', email: `doc-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Dr Test' });
  const patientUser = await User.create({ role: 'patient', email: `pat-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Patient Test' });
  const doctorProfile = await DoctorProfile.create({
    userId: doctorUser._id, specialties: ['General Physician'], qualifications: ['MBBS'], regNo: 'DMC/R/12345',
    experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 },
    consultationFee: 500, languages: ['English'], verificationStatus: 'approved', avgRating: 4.5,
  });
  const labUser = await User.create({ role: 'lab', email: `lab-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'HealthFirst' });
  const labProfile = await LabProfile.create({
    userId: labUser._id, labName: 'HealthFirst Diagnostics', address: 'A', city: 'Noida',
    geo: { lat: 1, lng: 1 }, timings: '07:00-21:00', homeCollection: true, verificationStatus: 'approved',
    tests: [{ code: 'CBC', name: 'Complete Blood Count', price: 250, turnaroundHours: 6 }],
  });
  const prescription = await Prescription.create({
    appointmentId: new mongoose.Types.ObjectId(), doctorId: doctorProfile._id, patientId: patientUser._id,
    diagnosisNote: 'x', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
    recommendedTests: [{ testName: 'Complete Blood Count' }],
  });
  return { doctorUser, patientUser, doctorProfile, labProfile, prescription };
}

describe('createReferral', () => {
  it('creates a referral with an unguessable token and notifies the patient', async () => {
    const { doctorUser, patientUser, prescription, labProfile } = await seedPrescriptionAndLab();

    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);

    expect(referral.token).toBeTruthy();
    expect(referral.token.length).toBeGreaterThanOrEqual(20);
    expect(referral.status).toBe('sent');
    expect(referral.suggestedTestCodes).toEqual(['CBC']);
    expect(referral.patientId.toString()).toBe(patientUser._id.toString());

    const updatedPrescription = await Prescription.findById(prescription._id);
    expect(updatedPrescription!.recommendedTests[0]!.labReferralId!.toString()).toBe(referral._id.toString());

    const notifications = await Notification.find({ userId: patientUser._id });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.link).toBe(`/r/${referral.token}`);
  });

  it('rejects a doctor who did not write the prescription', async () => {
    const { prescription, labProfile } = await seedPrescriptionAndLab();
    const otherDoctorUser = await User.create({ role: 'doctor', email: `other-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Dr Other' });
    await DoctorProfile.create({
      userId: otherDoctorUser._id, specialties: ['Cardiology'], qualifications: ['MBBS'], regNo: 'DMC/R/54321',
      experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 },
      consultationFee: 500, languages: ['English'], verificationStatus: 'approved', avgRating: 4.5,
    });

    await expect(
      createReferral(otherDoctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC'])
    ).rejects.toThrow();
  });

  it('rejects a lab that does not offer the requested test code', async () => {
    const { doctorUser, prescription, labProfile } = await seedPrescriptionAndLab();

    await expect(
      createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['LFT'])
    ).rejects.toThrow();
  });
});

describe('getReferralByToken', () => {
  it('returns the lab, referred tests, and total price, marking the referral opened on first view', async () => {
    const { doctorUser, prescription, labProfile } = await seedPrescriptionAndLab();
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    expect(referral.status).toBe('sent');

    const result = await getReferralByToken(referral.token);

    expect(result).not.toBeNull();
    expect(result!.lab.labName).toBe('HealthFirst Diagnostics');
    expect(result!.tests).toHaveLength(1);
    expect(result!.tests[0]!.code).toBe('CBC');
    expect(result!.totalPrice).toBe(250);

    const reloaded = await LabReferral.findById(referral._id);
    expect(reloaded!.status).toBe('opened');
    expect(reloaded!.timeline.map((t) => t.status)).toContain('opened');
  });

  it('does not regress status from booked/further back to opened on a re-view', async () => {
    const { doctorUser, prescription, labProfile } = await seedPrescriptionAndLab();
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    await LabReferral.findByIdAndUpdate(referral._id, { status: 'booked', $push: { timeline: { status: 'booked', at: new Date() } } });

    await getReferralByToken(referral.token);

    const reloaded = await LabReferral.findById(referral._id);
    expect(reloaded!.status).toBe('booked');
  });

  it('returns null for an unknown token', async () => {
    const result = await getReferralByToken('nonexistent-token-xyz');
    expect(result).toBeNull();
  });
});

describe('listReferralsForDoctor', () => {
  it('returns only the requesting doctor\'s own referrals, paginated', async () => {
    const { doctorUser, prescription, labProfile } = await seedPrescriptionAndLab();
    await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);

    const result = await listReferralsForDoctor(doctorUser._id.toString(), 1, 20);
    expect(result.total).toBe(1);
    expect(result.items[0]!.suggestedTestCodes).toEqual(['CBC']);
  });
});
