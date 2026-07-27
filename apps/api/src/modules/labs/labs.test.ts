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
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'Lab A', phone: '9999999999', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return res.headers['set-cookie'] as unknown as string[];
}

const validLab = {
  labName: 'HealthFirst Diagnostics', address: '1 Diag Rd', city: 'Noida',
  geo: { lat: 28.5, lng: 77.3 }, timings: '07:00-21:00', homeCollection: true,
};

describe('lab profile + test catalog CRUD', () => {
  it('upserts the lab profile', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'lab', 'lab1@medlink.demo');
    const res = await request(app).put('/api/labs/me').set('Cookie', cookies).send(validLab);
    expect(res.status).toBe(200);
    expect(res.body.profile.labName).toBe('HealthFirst Diagnostics');
  });

  it('adds, edits, and removes a test from the catalog', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'lab', 'lab2@medlink.demo');
    await request(app).put('/api/labs/me').set('Cookie', cookies).send(validLab);

    const addRes = await request(app).post('/api/labs/me/tests').set('Cookie', cookies).send({
      code: 'CBC', name: 'Complete Blood Count', price: 250, turnaroundHours: 6,
    });
    expect(addRes.status).toBe(200);
    expect(addRes.body.profile.tests).toHaveLength(1);

    const editRes = await request(app).patch('/api/labs/me/tests/CBC').set('Cookie', cookies).send({ price: 275 });
    expect(editRes.status).toBe(200);
    expect(editRes.body.profile.tests[0].price).toBe(275);

    const deleteRes = await request(app).delete('/api/labs/me/tests/CBC').set('Cookie', cookies);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.profile.tests).toHaveLength(0);
  });

  it('rejects an invalid or empty test edit with 400', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'lab', 'lab4@medlink.demo');
    await request(app).put('/api/labs/me').set('Cookie', cookies).send(validLab);
    await request(app).post('/api/labs/me/tests').set('Cookie', cookies).send({
      code: 'CBC', name: 'Complete Blood Count', price: 250, turnaroundHours: 6,
    });

    // A negative price would previously have been written straight through.
    const badPrice = await request(app).patch('/api/labs/me/tests/CBC').set('Cookie', cookies).send({ price: -10 });
    expect(badPrice.status).toBe(400);

    // An empty body would previously have reached Mongo as an empty `$set` and 500.
    const empty = await request(app).patch('/api/labs/me/tests/CBC').set('Cookie', cookies).send({});
    expect(empty.status).toBe(400);
  });
});

describe('GET /api/labs/public/:id', () => {
  it('hides an unapproved lab', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'lab', 'lab3@medlink.demo');
    const putRes = await request(app).put('/api/labs/me').set('Cookie', cookies).send(validLab);
    const res = await request(app).get(`/api/labs/public/${putRes.body.profile._id}`);
    expect(res.status).toBe(404);
  });
});
