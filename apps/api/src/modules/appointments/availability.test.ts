import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import type { Express } from 'express';
import { createApp } from '../../app';
import { setRedisClient } from '../../lib/redis';
import { DoctorProfile } from '../../models/DoctorProfile';

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
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function registerAndLogin(app: Express, role: string, email: string) {
  const registerRes = await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'Doc A', phone: '9999999999', role });
  // The availability-rule/blocked-date controllers scope every query to the
  // caller's DoctorProfile (via DoctorProfile.findOne({ userId })), matching
  // Phase 1's id-convention. Registering as 'doctor' does not itself create a
  // DoctorProfile (see doctors.controller's upsertMyProfile) so, mirroring
  // Phase 1's doctors.test.ts pattern of PUTing a profile first, create one
  // directly here for doctor-role test users.
  if (role === 'doctor') {
    await DoctorProfile.create({
      userId: registerRes.body.user.id,
      specialties: ['General Physician'],
      qualifications: ['MBBS'],
      regNo: `DMC/R/${Math.floor(Math.random() * 100000)}`,
      experienceYears: 5,
      bio: 'Test doctor profile for availability CRUD tests.',
      clinicName: 'Test Clinic',
      clinicAddress: '123 Test Rd',
      city: 'Noida',
      geo: { lat: 28.5, lng: 77.3 },
      consultationFee: 500,
      languages: ['English'],
    });
  }
  const res = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return res.headers['set-cookie'] as unknown as string[];
}

describe('availability rules CRUD', () => {
  it('creates and lists a doctor availability rule', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'avail1@medlink.demo');

    const createRes = await request(app).post('/api/doctors/me/availability-rules').set('Cookie', cookies).send({
      dayOfWeek: 1, startTime: '18:00', endTime: '21:00', slotMinutes: 15,
      validFrom: '2026-01-01', validTo: '2026-12-31',
    });
    expect(createRes.status).toBe(201);

    const listRes = await request(app).get('/api/doctors/me/availability-rules').set('Cookie', cookies);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
  });

  it('deletes an availability rule', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'avail2@medlink.demo');
    const createRes = await request(app).post('/api/doctors/me/availability-rules').set('Cookie', cookies).send({
      dayOfWeek: 2, startTime: '09:00', endTime: '12:00', slotMinutes: 10,
      validFrom: '2026-01-01', validTo: '2026-12-31',
    });
    const ruleId = createRes.body.rule._id;

    const deleteRes = await request(app).delete(`/api/doctors/me/availability-rules/${ruleId}`).set('Cookie', cookies);
    expect(deleteRes.status).toBe(200);

    const listRes = await request(app).get('/api/doctors/me/availability-rules').set('Cookie', cookies);
    expect(listRes.body.items).toHaveLength(0);
  });

  it('rejects a patient trying to set availability', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', 'notdoc@medlink.demo');
    const res = await request(app).post('/api/doctors/me/availability-rules').set('Cookie', cookies).send({
      dayOfWeek: 1, startTime: '18:00', endTime: '21:00', slotMinutes: 15,
      validFrom: '2026-01-01', validTo: '2026-12-31',
    });
    expect(res.status).toBe(403);
  });
});

describe('blocked dates CRUD', () => {
  it('creates and lists a blocked date', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'block1@medlink.demo');

    const createRes = await request(app).post('/api/doctors/me/blocked-dates').set('Cookie', cookies).send({
      date: '2026-08-15', reason: 'On leave',
    });
    expect(createRes.status).toBe(201);

    const listRes = await request(app).get('/api/doctors/me/blocked-dates').set('Cookie', cookies);
    expect(listRes.body.items).toHaveLength(1);
  });
});
