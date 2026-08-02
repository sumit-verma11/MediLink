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

// A Wednesday so day-of-week arithmetic in the test is deterministic, but computed
// relative to "now" rather than hardcoded: generateSlotsForDoctor now skips slots that
// have already passed, so a fixed calendar date would silently stop producing slots once
// that date is in the past.
function nextWednesdayUTC(): Date {
  const today = new Date();
  const day = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const offset = ((3 - new Date(day).getUTCDay() + 7) % 7) || 7; // strictly the NEXT Wednesday
  return new Date(day + offset * 24 * 60 * 60 * 1000);
}
const FIXED_WEDNESDAY = nextWednesdayUTC();
const VALID_FROM = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
const VALID_TO = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
// AvailabilityRule times are IST wall-clock (see slotService.ts's IST_OFFSET_MINUTES) --
// this helper takes IST hours/minutes and returns the equivalent UTC instant, matching
// what generateSlotsForDoctor actually produces for a rule with that startTime.
const IST_OFFSET_MINUTES = 5 * 60 + 30;
function wednesdayAt(hours: number, minutes: number): Date {
  return new Date(FIXED_WEDNESDAY.getTime() + (hours * 60 + minutes - IST_OFFSET_MINUTES) * 60 * 1000);
}

describe('generateSlotsForDoctor', () => {
  it('generates slots only on the rule\'s day of week, within start/end time', async () => {
    const doctorId = new mongoose.Types.ObjectId().toString();
    await AvailabilityRule.create({
      doctorId, dayOfWeek: 3 /* Wednesday */, startTime: '18:00', endTime: '19:00', slotMinutes: 15,
      validFrom: VALID_FROM, validTo: VALID_TO,
    });

    const slots = await generateSlotsForDoctor(doctorId, FIXED_WEDNESDAY, 7);

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.start.getUTCDay()).toBe(3);
      // Rule is 18:00-19:00 IST, which is 12:30-13:30 UTC (IST = UTC+5:30).
      const hours = slot.start.getUTCHours();
      expect(hours).toBeGreaterThanOrEqual(12);
      expect(hours).toBeLessThan(14);
    }
    // 18:00-19:00 at 15-min intervals = 4 slots per matching day
    const daysMatched = slots.length / 4;
    expect(Number.isInteger(daysMatched)).toBe(true);
  });

  it('excludes a fully blocked date', async () => {
    const doctorId = new mongoose.Types.ObjectId().toString();
    await AvailabilityRule.create({
      doctorId, dayOfWeek: 3, startTime: '18:00', endTime: '19:00', slotMinutes: 15,
      validFrom: VALID_FROM, validTo: VALID_TO,
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
      validFrom: VALID_FROM, validTo: VALID_TO,
    });
    const bookedStart = wednesdayAt(18, 0);
    await Appointment.create({
      doctorId, patientId, slotStart: bookedStart, slotEnd: wednesdayAt(18, 15), status: 'confirmed',
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
      validFrom: VALID_FROM, validTo: VALID_TO,
    });
    await Appointment.create({
      doctorId, patientId, slotStart: wednesdayAt(18, 0),
      slotEnd: wednesdayAt(18, 15), status: 'rejected',
    });

    const slots = await generateSlotsForDoctor(doctorId, FIXED_WEDNESDAY, 1);
    expect(slots).toHaveLength(4);
  });

  it('never returns a slot that has already started', async () => {
    const doctorId = new mongoose.Types.ObjectId().toString();
    // A rule spanning the whole of today (IST), so the window unavoidably contains times
    // that are already in the past by the time the generator runs. dayOfWeek must be
    // computed the same IST-shifted way generateSlotsForDoctor does -- using the raw
    // UTC weekday here would make this test flaky whenever it runs between 18:30 and
    // 23:59 UTC, when IST has already rolled into the next calendar day.
    const now = new Date();
    const todayIST = new Date(now.getTime() + IST_OFFSET_MINUTES * 60 * 1000).getUTCDay();
    await AvailabilityRule.create({
      doctorId, dayOfWeek: todayIST, startTime: '00:00', endTime: '23:00', slotMinutes: 60,
      validFrom: VALID_FROM, validTo: VALID_TO,
    });

    const slots = await generateSlotsForDoctor(doctorId, new Date(), 1);
    for (const slot of slots) {
      expect(slot.start.getTime()).toBeGreaterThan(Date.now() - 1000);
    }
  });
});
