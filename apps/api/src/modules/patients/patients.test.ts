import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../app';
import { resetTestRedis } from '../../test-utils/resetRateLimit';

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
  it('returns 429 once the apiLimiter budget is exhausted', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', `ratelimit-patients-${Date.now()}@medlink.demo`);

    let lastStatus = 200;
    for (let i = 0; i < 101; i += 1) {
      const res = await request(app).get('/api/patients/me').set('Cookie', cookies);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
