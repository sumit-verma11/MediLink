import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { resetTestRedis } from '../../test-utils/resetRateLimit';
import { AvailabilityRule } from '../../models/AvailabilityRule';
import { Appointment } from '../../models/Appointment';
import { DoctorProfile } from '../../models/DoctorProfile';
import { User } from '../../models/User';
import { createAppointment } from './appointments.service';
import { generateSlotsForDoctor } from './slotService';
import { AppError } from '../../lib/errors';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
beforeEach(async () => {
  // Fresh + flushed Redis per test so the slot lock's NX semantics are never affected
  // by state left behind by another test or another suite.
  await resetTestRedis();
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

/**
 * createAppointment validates the requested interval against real generated
 * availability, so the race needs a real approved doctor with a real rule — and the
 * contended slot must be one the generator actually produced.
 */
async function seedBookableDoctor(): Promise<{ doctorId: string; slotStart: Date; slotEnd: Date }> {
  const doctorUser = await User.create({
    role: 'doctor', email: `race-${Date.now()}-${Math.random()}@medlink.demo`,
    phone: '9999999999', passwordHash: 'x', name: 'Dr Race',
  });
  const profile = await DoctorProfile.create({
    userId: doctorUser._id, specialties: ['General Physician'], qualifications: ['MBBS'],
    regNo: `DMC/R/${Math.floor(Math.random() * 100000)}`, experienceYears: 5, bio: 'b',
    clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 },
    consultationFee: 500, languages: ['English'], verificationStatus: 'approved',
  });
  const doctorId = profile._id.toString();

  // Today's and tomorrow's day-of-week in IST (slotService generates against IST
  // calendar days -- a raw UTC weekday here would be flaky between 18:30 and 23:59 UTC,
  // when IST has already rolled to the next day), so a run late in the day still has
  // future slots.
  const IST_OFFSET_MINUTES = 5 * 60 + 30;
  for (const dayOffset of [0, 1]) {
    const istNow = new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000 + IST_OFFSET_MINUTES * 60 * 1000);
    await AvailabilityRule.create({
      doctorId: profile._id,
      dayOfWeek: istNow.getUTCDay(),
      startTime: '00:00', endTime: '23:00', slotMinutes: 60,
      validFrom: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
  }

  const slots = await generateSlotsForDoctor(doctorId, new Date(), 2);
  const slot = slots[0];
  if (!slot) throw new Error('expected at least one generated slot for the race fixture');
  return { doctorId, slotStart: slot.start, slotEnd: slot.end };
}

describe('double-booking race', () => {
  it('exactly one of two parallel requests for the same doctor+slot succeeds', async () => {
    const { doctorId, slotStart, slotEnd } = await seedBookableDoctor();

    const patientA = new mongoose.Types.ObjectId().toString();
    const patientB = new mongoose.Types.ObjectId().toString();
    const input = { doctorId, slotStart, slotEnd };

    const results = await Promise.allSettled([
      createAppointment(patientA, input),
      createAppointment(patientB, input),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AppError);
    expect(((rejected[0] as PromiseRejectedResult).reason as AppError).statusCode).toBe(409);

    // The most direct possible statement of "no double-booking": whatever the API
    // returned, the database holds exactly one appointment for this doctor+slot.
    expect(await Appointment.countDocuments({})).toBe(1);
    expect(await Appointment.countDocuments({ doctorId, slotStart })).toBe(1);
  });

  it('ten parallel requests for the same slot still produce exactly one winner', async () => {
    const { doctorId, slotStart, slotEnd } = await seedBookableDoctor();
    const input = { doctorId, slotStart, slotEnd };

    const attempts = Array.from({ length: 10 }, () =>
      createAppointment(new mongoose.Types.ObjectId().toString(), input)
    );
    const results = await Promise.allSettled(attempts);
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(9);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(AppError);
      expect((r.reason as AppError).statusCode).toBe(409);
    }

    expect(await Appointment.countDocuments({})).toBe(1);
    expect(await Appointment.countDocuments({ doctorId, slotStart })).toBe(1);
  });
});
