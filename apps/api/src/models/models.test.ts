import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from './User';
import { DoctorProfile } from './DoctorProfile';
import { Prescription } from './Prescription';
import { BlockedDate } from './BlockedDate';
import { Appointment } from './Appointment';
import { TriageSession } from './TriageSession';
import { LabBooking } from './LabBooking';
import { LabReferral } from './LabReferral';
import { Rating } from './Rating';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Mongoose builds each models indexes in the background after connecting and
  // does not block on them. This files first write is a uniqueness test, so
  // without waiting here it can race the User email index build and observe no
  // unique constraint yet, letting a duplicate email insert incorrectly succeed.
  // Model.init() resolves once a models indexes actually exist in MongoDB -- the
  // documented fix for exactly this race per Mongoose own testing guidance.
  await Promise.all([User.init(), DoctorProfile.init(), Prescription.init(), BlockedDate.init(), Appointment.init(), TriageSession.init(), LabBooking.init(), LabReferral.init(), Rating.init()]);
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('User model', () => {
  it('requires email and rejects duplicates', async () => {
    await User.create({
      role: 'patient', email: 'a@b.com', phone: '9999999999',
      passwordHash: 'hash', name: 'A',
    });
    await expect(
      User.create({ role: 'patient', email: 'a@b.com', phone: '9999999999', passwordHash: 'hash', name: 'B' })
    ).rejects.toThrow();
  });
});

describe('DoctorProfile model', () => {
  it('defaults verificationStatus to pending', async () => {
    const user = await User.create({
      role: 'doctor', email: 'doc@b.com', phone: '9999999999', passwordHash: 'hash', name: 'Doc',
    });
    const profile = await DoctorProfile.create({
      userId: user._id, specialties: ['Dermatology'], qualifications: ['MBBS'],
      regNo: 'DMC/R/00001', experienceYears: 5, bio: 'bio', clinicName: 'Clinic',
      clinicAddress: 'Addr', city: 'Noida', geo: { lat: 1, lng: 1 },
      consultationFee: 500, languages: ['English'],
    });
    expect(profile.verificationStatus).toBe('pending');
  });
});

describe('Prescription model', () => {
  it('defaults immutable to true', async () => {
    const rx = await Prescription.create({
      appointmentId: new mongoose.Types.ObjectId(),
      doctorId: new mongoose.Types.ObjectId(),
      patientId: new mongoose.Types.ObjectId(),
      diagnosisNote: 'note',
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 3 }],
      advice: 'rest',
    });
    expect(rx.immutable).toBe(true);
  });

  it('defaults version to 1 and supersededBy to undefined', async () => {
    const rx = await Prescription.create({
      appointmentId: new mongoose.Types.ObjectId(),
      doctorId: new mongoose.Types.ObjectId(),
      patientId: new mongoose.Types.ObjectId(),
      diagnosisNote: 'Note',
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest',
    });
    expect(rx.version).toBe(1);
    expect(rx.supersededBy).toBeUndefined();
    expect(rx.immutable).toBe(true);
  });

  it('persists a supersededBy link and an incremented version', async () => {
    const original = await Prescription.create({
      appointmentId: new mongoose.Types.ObjectId(),
      doctorId: new mongoose.Types.ObjectId(),
      patientId: new mongoose.Types.ObjectId(),
      diagnosisNote: 'Note v1',
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest',
    });
    const amended = await Prescription.create({
      appointmentId: original.appointmentId,
      doctorId: original.doctorId,
      patientId: original.patientId,
      diagnosisNote: 'Note v2, corrected dosage',
      medicines: [{ name: 'Paracetamol', dosage: '650mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest',
      version: 2,
    });
    original.supersededBy = amended._id;
    await original.save();

    const reloaded = await Prescription.findById(original._id);
    expect(reloaded!.supersededBy!.toString()).toBe(amended._id.toString());
    expect(amended.version).toBe(2);
  });
});

describe('BlockedDate model', () => {
  it('enforces one block per doctor per date', async () => {
    const doctorId = new mongoose.Types.ObjectId();
    await BlockedDate.create({ doctorId, date: new Date('2026-08-15') });
    await expect(
      BlockedDate.create({ doctorId, date: new Date('2026-08-15') })
    ).rejects.toThrow();
  });
});

describe('Appointment model — partial unique index', () => {
  it('rejects a second active appointment for the same doctor+slot, but allows one after the first is cancelled', async () => {
    const doctorId = new mongoose.Types.ObjectId();
    const patientId = new mongoose.Types.ObjectId();
    const slotStart = new Date('2026-08-15T18:00:00.000Z');
    const slotEnd = new Date('2026-08-15T18:15:00.000Z');

    const first = await Appointment.create({ doctorId, patientId, slotStart, slotEnd, status: 'requested' });

    await expect(
      Appointment.create({ doctorId, patientId, slotStart, slotEnd, status: 'requested' })
    ).rejects.toThrow();

    await Appointment.findByIdAndUpdate(first._id, { status: 'cancelled' });

    await expect(
      Appointment.create({ doctorId, patientId, slotStart, slotEnd, status: 'requested' })
    ).resolves.toBeTruthy();
  });
});

describe('TriageSession model', () => {
  it('defaults isRedFlag to false', async () => {
    const session = await TriageSession.create({ patientId: new mongoose.Types.ObjectId() });
    expect(session.isRedFlag).toBe(false);
  });

  it('persists isRedFlag: true when set', async () => {
    const session = await TriageSession.create({ patientId: new mongoose.Types.ObjectId(), isRedFlag: true });
    expect(session.isRedFlag).toBe(true);
  });
});

describe('LabBooking model', () => {
  it('defaults status to booked and rejects an invalid status value', async () => {
    const booking = await LabBooking.create({
      patientId: new mongoose.Types.ObjectId(),
      labId: new mongoose.Types.ObjectId(),
      testCodes: ['CBC'],
      totalPrice: 250,
      scheduledAt: new Date(),
      homeCollection: false,
    });
    expect(booking.status).toBe('booked');

    await expect(
      LabBooking.create({
        patientId: new mongoose.Types.ObjectId(),
        labId: new mongoose.Types.ObjectId(),
        testCodes: ['CBC'],
        totalPrice: 250,
        scheduledAt: new Date(),
        homeCollection: false,
        status: 'not_a_real_status' as any,
      })
    ).rejects.toThrow();
  });
});

describe('Rating model', () => {
  it('creates a valid rating with all required fields', async () => {
    const rating = await Rating.create({
      doctorId: new mongoose.Types.ObjectId(),
      patientId: new mongoose.Types.ObjectId(),
      appointmentId: new mongoose.Types.ObjectId(),
      score: 5,
      text: 'Excellent doctor!',
    });
    expect(rating.score).toBe(5);
    expect(rating.text).toBe('Excellent doctor!');
  });

  it('enforces unique constraint on appointmentId (one rating per appointment)', async () => {
    const doctorId = new mongoose.Types.ObjectId();
    const patientId = new mongoose.Types.ObjectId();
    const appointmentId = new mongoose.Types.ObjectId();

    await Rating.create({
      doctorId,
      patientId,
      appointmentId,
      score: 4,
    });

    await expect(
      Rating.create({
        doctorId,
        patientId,
        appointmentId,
        score: 3,
      })
    ).rejects.toThrow();
  });

  it('requires score field', async () => {
    await expect(
      Rating.create({
        doctorId: new mongoose.Types.ObjectId(),
        patientId: new mongoose.Types.ObjectId(),
        appointmentId: new mongoose.Types.ObjectId(),
      })
    ).rejects.toThrow();
  });
});
