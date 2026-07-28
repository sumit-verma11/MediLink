import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runSeed } from './seed';
import { User } from '../models/User';
import { DoctorProfile } from '../models/DoctorProfile';
import { LabProfile } from '../models/LabProfile';
import { Appointment } from '../models/Appointment';
import { AvailabilityRule } from '../models/AvailabilityRule';
import { TriageSession } from '../models/TriageSession';

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

describe('runSeed — Phase 2 slice', () => {
  it('seeds availability rules for approved doctors and exactly 15 appointments with the spec\'d status distribution', async () => {
    await runSeed();

    const ruleCount = await AvailabilityRule.countDocuments({});
    expect(ruleCount).toBeGreaterThan(0);

    const appointments = await Appointment.find({});
    expect(appointments).toHaveLength(15);

    const counts: Record<string, number> = {};
    for (const appt of appointments) counts[appt.status] = (counts[appt.status] ?? 0) + 1;

    // CLAUDE.md §6.4 lists "6 completed ... each with prescription" as distinct from
    // the separately-listed "1 completed-without-prescription" — 7 completed total,
    // not 6. Phase 4 is what actually distinguishes the two (by whether a Prescription
    // document references the appointment); this phase just needs the status counts right.
    expect(counts.completed).toBe(7);
    expect(counts.confirmed).toBe(3);
    expect(counts.requested).toBe(2);
    expect(counts.rejected).toBe(1);
    expect(counts.cancelled).toBe(1);
    expect(counts.no_show).toBe(1);
  });
});

describe('runSeed — Phase 3 slice', () => {
  it('seeds exactly 4 triage sessions, one of which is a red-flag case, and links at least 2 to completed appointments', async () => {
    await runSeed();

    const sessions = await TriageSession.find({});
    expect(sessions).toHaveLength(4);

    const redFlagSessions = sessions.filter((s) => s.isRedFlag);
    expect(redFlagSessions).toHaveLength(1);

    const linkedCount = await Appointment.countDocuments({ triageSessionId: { $ne: null } });
    expect(linkedCount).toBeGreaterThanOrEqual(2);
  });
});
