import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../app';
import { resetTestRedis } from '../../test-utils/resetRateLimit';
import { getRedis } from '../../lib/redis';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
beforeEach(async () => {
  // Shared helper: fresh Redis + flushed store, so the auth rate-limit budget starts
  // empty for every test in this file. See src/test-utils/resetRateLimit.ts.
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

async function registerAndLogin(app: Express, role: string, email: string) {
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'A', phone: '9999999999', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return res.headers['set-cookie'] as unknown as string[];
}

describe('PUT /api/patients/me', () => {
  it('upserts the patient profile for the authenticated patient', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', 'p1@medlink.demo');

    const res = await request(app).put('/api/patients/me').set('Cookie', cookies).send({ age: 30, gender: 'male', city: 'Noida' });
    expect(res.status).toBe(200);
    expect(res.body.profile.city).toBe('Noida');
  });

  it('rejects a doctor role with 403', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'd1@medlink.demo');
    const res = await request(app).put('/api/patients/me').set('Cookie', cookies).send({ city: 'Delhi' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/patients/me', () => {
  it('returns the current patient profile', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', 'p2@medlink.demo');
    await request(app).put('/api/patients/me').set('Cookie', cookies).send({ city: 'Ghaziabad' });

    const res = await request(app).get('/api/patients/me').set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.profile.city).toBe('Ghaziabad');
  });
});

describe('rate limiting', () => {
  // (I3) This used to fire 101 real HTTP requests in a loop to trigger apiLimiter's
  // 100/min budget purely through wall-clock timing. That was flaky (~1-in-3 failures)
  // because of how ioredis-mock's PEXPIRE-based TTL interacts with the loop's async
  // scheduling. Instead: make one real request to discover the exact Redis key
  // SimpleRedisStore uses for this caller (its shape depends on express-rate-limit's
  // keyGenerator, not worth hardcoding), jump the counter directly to one below the
  // limit via Redis, then make two more real requests -- the 100th (still allowed) and
  // the 101st (blocked). This is deterministic and still exercises apiLimiter end-to-end
  // through the real HTTP route (not a unit test of the limiter in isolation): every
  // response in the assertion comes from an actual request through the middleware.
  it('returns 429 once the apiLimiter budget is exhausted', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', `ratelimit-patients-${Date.now()}@medlink.demo`);

    const firstRes = await request(app).get('/api/patients/me').set('Cookie', cookies);
    expect(firstRes.status).toBe(200);

    const redis = getRedis();
    const keys = await redis.keys('rl:api:*');
    expect(keys).toHaveLength(1);
    const limiterKey = keys[0]!;
    // Counter is currently 1 (from firstRes above); jump it to 99 so the very next
    // request becomes the 100th (still within budget) and the one after that the 101st.
    await redis.incrby(limiterKey, 98);

    const stillAllowedRes = await request(app).get('/api/patients/me').set('Cookie', cookies);
    expect(stillAllowedRes.status).toBe(200);

    const blockedRes = await request(app).get('/api/patients/me').set('Cookie', cookies);
    expect(blockedRes.status).toBe(429);
  });
});
