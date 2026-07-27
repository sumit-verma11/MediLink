import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AvailabilityRule } from '../../models/AvailabilityRule';
import { BlockedDate } from '../../models/BlockedDate';
import { Appointment } from '../../models/Appointment';
import { generateSlotsForDoctor } from './slotService';

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

// A fixed Wednesday so day-of-week arithmetic in the test is deterministic.
const FIXED_WEDNESDAY = new Date('2026-08-05T00:00:00.000Z'); // 2026-08-05 is a Wednesday

describe('generateSlotsForDoctor', () => {
  it('generates slots only on the rule\'s day of week, within start/end time', async () => {
    const doctorId = new mongoose.Types.ObjectId().toString();
    await AvailabilityRule.create({
      doctorId, dayOfWeek: 3 /* Wednesday */, startTime: '18:00', endTime: '19:00', slotMinutes: 15,
      validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'),
    });

    const slots = await generateSlotsForDoctor(doctorId, FIXED_WEDNESDAY, 7);

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.start.getUTCDay()).toBe(3);
      const hours = slot.start.getUTCHours();
      expect(hours).toBeGreaterThanOrEqual(18);
      expect(hours).toBeLessThan(19);
    }
    // 18:00-19:00 at 15-min intervals = 4 slots per matching day
    const daysMatched = slots.length / 4;
    expect(Number.isInteger(daysMatched)).toBe(true);
  });

  it('excludes a fully blocked date', async () => {
    const doctorId = new mongoose.Types.ObjectId().toString();
    await AvailabilityRule.create({
      doctorId, dayOfWeek: 3, startTime: '18:00', endTime: '19:00', slotMinutes: 15,
      validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'),
    });
    await BlockedDate.create({ doctorId, date: FIXED_WEDNESDAY });

    const slots = await generateSlotsForDoctor(doctorId, FIXED_WEDNESDAY, 1);
    expect(slots).toHaveLength(0);
  });

  it('excludes a slot already booked by an active appointment', async () => {
    const doctorId = new mongoose.Types.ObjectId().toString();
    const patientId = new mongoose.Types.ObjectId();
    await AvailabilityRule.create({
      doctorId, dayOfWeek: 3, startTime: '18:00', endTime: '19:00', slotMinutes: 15,
      validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'),
    });
    const bookedStart = new Date('2026-08-05T18:00:00.000Z');
    await Appointment.create({
      doctorId, patientId, slotStart: bookedStart, slotEnd: new Date('2026-08-05T18:15:00.000Z'), status: 'confirmed',
    });

    const slots = await generateSlotsForDoctor(doctorId, FIXED_WEDNESDAY, 1);
    expect(slots.some((s) => s.start.getTime() === bookedStart.getTime())).toBe(false);
    expect(slots).toHaveLength(3); // 4 slots minus the 1 booked
  });

  it('does not exclude a slot whose appointment was rejected (inactive status)', async () => {
    const doctorId = new mongoose.Types.ObjectId().toString();
    const patientId = new mongoose.Types.ObjectId();
    await AvailabilityRule.create({
      doctorId, dayOfWeek: 3, startTime: '18:00', endTime: '19:00', slotMinutes: 15,
      validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'),
    });
    await Appointment.create({
      doctorId, patientId, slotStart: new Date('2026-08-05T18:00:00.000Z'),
      slotEnd: new Date('2026-08-05T18:15:00.000Z'), status: 'rejected',
    });

    const slots = await generateSlotsForDoctor(doctorId, FIXED_WEDNESDAY, 1);
    expect(slots).toHaveLength(4);
  });
});
