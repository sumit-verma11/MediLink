import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import type { Express } from 'express';
import { createApp } from '../../app';
import { setRedisClient } from '../../lib/redis';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  setRedisClient(new RedisMock());
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key].deleteMany({});
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
