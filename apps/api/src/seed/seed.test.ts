import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runSeed } from './seed';
import { User } from '../models/User';
import { DoctorProfile } from '../models/DoctorProfile';
import { LabProfile } from '../models/LabProfile';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('runSeed', () => {
  it('is idempotent and creates the expected demo accounts', async () => {
    await runSeed();
    await runSeed(); // run twice to prove idempotency

    const admin = await User.findOne({ email: 'admin@medlink.demo' });
    expect(admin).not.toBeNull();

    const doctors = await User.find({ role: 'doctor' });
    expect(doctors).toHaveLength(12);

    const approvedDoctors = await DoctorProfile.countDocuments({ verificationStatus: 'approved' });
    expect(approvedDoctors).toBe(11);
    const pendingDoctors = await DoctorProfile.countDocuments({ verificationStatus: 'pending' });
    expect(pendingDoctors).toBe(1);

    const labs = await User.find({ role: 'lab' });
    expect(labs).toHaveLength(4);
    const pendingLabs = await LabProfile.countDocuments({ verificationStatus: 'pending' });
    expect(pendingLabs).toBe(1);

    const patients = await User.find({ role: 'patient' });
    expect(patients).toHaveLength(6);
  });
});
