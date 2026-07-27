import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Redis from 'ioredis-mock';
import { getRedis, setRedisClient } from '../../lib/redis';
import { AvailabilityRule } from '../../models/AvailabilityRule';
import { createAppointment } from './appointments.service';
import { AppError } from '../../lib/errors';

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

describe('double-booking race', () => {
  it('exactly one of two parallel requests for the same doctor+slot succeeds', async () => {
    // A real ioredis-mock instance (not shared with other test files) so this test's
    // NX semantics aren't affected by state from any other suite. ioredis-mock actually
    // shares one global in-memory store across all `new Redis()` instances by default
    // (it simulates multiple clients on one Redis server), so flush explicitly to
    // guarantee this test starts from a clean slate regardless of what ran before it —
    // same precedent as slotLock.test.ts.
    setRedisClient(new Redis());
    await getRedis().flushall();

    const doctorId = new mongoose.Types.ObjectId().toString();
    await AvailabilityRule.create({
      doctorId, dayOfWeek: new Date().getUTCDay(), startTime: '00:00', endTime: '23:00', slotMinutes: 60,
      validFrom: new Date('2020-01-01'), validTo: new Date('2030-12-31'),
    });

    const patientA = new mongoose.Types.ObjectId().toString();
    const patientB = new mongoose.Types.ObjectId().toString();
    const slotStart = new Date();
    slotStart.setUTCHours(10, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

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
  });

  it('ten parallel requests for the same slot still produce exactly one winner', async () => {
    setRedisClient(new Redis());
    await getRedis().flushall();

    const doctorId = new mongoose.Types.ObjectId().toString();
    await AvailabilityRule.create({
      doctorId, dayOfWeek: new Date().getUTCDay(), startTime: '00:00', endTime: '23:00', slotMinutes: 60,
      validFrom: new Date('2020-01-01'), validTo: new Date('2030-12-31'),
    });
    const slotStart = new Date();
    slotStart.setUTCHours(11, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
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
  });
});
