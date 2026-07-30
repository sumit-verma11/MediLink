import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createBooking, updateBookingStatus } from './labBookings.service';
import { createReferral, getReferralByToken } from '../labReferrals/labReferrals.service';
import { User } from '../../models/User';
import { DoctorProfile } from '../../models/DoctorProfile';
import { LabProfile } from '../../models/LabProfile';
import { Prescription } from '../../models/Prescription';
import { LabReferral } from '../../models/LabReferral';
import { LabBooking } from '../../models/LabBooking';
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

async function seedLabAndPrescription() {
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
  return { doctorUser, patientUser, labUser, labProfile, prescription };
}

describe('createBooking', () => {
  it('creates a walk-in booking with a computed total price', async () => {
    const { patientUser, labProfile } = await seedLabAndPrescription();

    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: false,
    });

    expect(booking.totalPrice).toBe(250);
    expect(booking.status).toBe('booked');
    expect(booking.referralId).toBeUndefined();
  });

  it('creates a referral-linked booking and transitions the referral to booked', async () => {
    const { doctorUser, patientUser, labProfile, prescription } = await seedLabAndPrescription();
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    await getReferralByToken(referral.token); // simulate the patient opening the link first

    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: true,
    }, referral.token);

    expect(booking.referralId!.toString()).toBe(referral._id.toString());

    const reloadedReferral = await LabReferral.findById(referral._id);
    expect(reloadedReferral!.status).toBe('booked');
  });

  it('rejects home collection when the lab does not offer it', async () => {
    const { patientUser, labProfile } = await seedLabAndPrescription();
    labProfile.homeCollection = false;
    await labProfile.save();

    await expect(
      createBooking(patientUser._id.toString(), labProfile._id.toString(), {
        testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: true,
      })
    ).rejects.toThrow();
  });
});

describe('updateBookingStatus', () => {
  it('transitions a booking through the pipeline and notifies patient + doctor on report_ready', async () => {
    const { doctorUser, patientUser, labUser, labProfile, prescription } = await seedLabAndPrescription();
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: false,
    }, referral.token);

    await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'sample_collected');
    const afterCollection = await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'report_ready', '/uploads/lab-reports/fake.pdf');

    expect(afterCollection.status).toBe('report_ready');
    expect(afterCollection.reportUrl).toBe('/uploads/lab-reports/fake.pdf');

    const reloadedReferral = await LabReferral.findById(referral._id);
    expect(reloadedReferral!.status).toBe('report_ready');
    expect(reloadedReferral!.reportUrl).toBe('/uploads/lab-reports/fake.pdf');

    const patientNotifications = await Notification.find({ userId: patientUser._id, type: 'lab_report_ready' });
    const doctorNotifications = await Notification.find({ userId: doctorUser._id, type: 'lab_report_ready' });
    expect(patientNotifications).toHaveLength(1);
    expect(doctorNotifications).toHaveLength(1);
  });

  it('notifies the patient on report_ready even for a walk-in booking with no referral', async () => {
    const { patientUser, labUser, labProfile } = await seedLabAndPrescription();
    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: false,
    });
    expect(booking.referralId).toBeUndefined();

    await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'sample_collected');
    await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'report_ready', '/uploads/lab-reports/walkin.pdf');

    const patientNotifications = await Notification.find({ userId: patientUser._id, type: 'lab_report_ready' });
    expect(patientNotifications).toHaveLength(1);
  });

  it('rejects a lab updating a booking that is not its own', async () => {
    const { patientUser, labProfile } = await seedLabAndPrescription();
    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: false,
    });
    const otherLabUser = await User.create({ role: 'lab', email: `otherlab-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Other Lab' });

    await expect(updateBookingStatus(otherLabUser._id.toString(), booking._id.toString(), 'sample_collected')).rejects.toThrow();
  });
});
