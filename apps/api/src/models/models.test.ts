import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from './User';
import { DoctorProfile } from './DoctorProfile';
import { Prescription } from './Prescription';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
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
});
