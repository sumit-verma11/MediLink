import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import type { Express } from 'express';
import { createApp } from '../../app';
import { setRedisClient } from '../../lib/redis';
import { AvailabilityRule } from '../../models/AvailabilityRule';
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
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'A', phone: '9999999999', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return res.headers['set-cookie'] as unknown as string[];
}

async function seedDoctorWithAvailability(app: Express) {
  const docCookies = await registerAndLogin(app, 'doctor', `doc-${Date.now()}@medlink.demo`);
  await request(app).put('/api/doctors/me').set('Cookie', docCookies).send({
    specialties: ['Dermatology'], qualifications: ['MBBS'], regNo: 'DMC/R/00001',
    experienceYears: 5, bio: 'bio', clinicName: 'Clinic', clinicAddress: 'Addr',
    city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 500, languages: ['English'],
  });
  const doctorProfile = await DoctorProfile.findOne({}).sort({ _id: -1 });
  await AvailabilityRule.create({
    doctorId: doctorProfile!._id, dayOfWeek: new Date().getUTCDay(), startTime: '00:00', endTime: '23:00', slotMinutes: 60,
    validFrom: new Date('2020-01-01'), validTo: new Date('2030-12-31'),
  });
  return doctorProfile!._id.toString();
}

describe('POST /api/appointments', () => {
  it('creates a requested appointment for a free slot', async () => {
    const app = createApp();
    const doctorId = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'bookpatient1@medlink.demo');

    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=1`).set('Cookie', patientCookies);
    const firstSlot = slotsRes.body.slots[0];

    const res = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: firstSlot.start, slotEnd: firstSlot.end,
    });

    expect(res.status).toBe(201);
    expect(res.body.appointment.status).toBe('requested');
    expect(res.body.appointment.timeline).toHaveLength(1);
  });

  it('rejects a second booking for the same slot with 409', async () => {
    const app = createApp();
    const doctorId = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'bookpatient2@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=1`).set('Cookie', patientCookies);
    const firstSlot = slotsRes.body.slots[0];

    await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: firstSlot.start, slotEnd: firstSlot.end,
    });

    const secondPatientCookies = await registerAndLogin(app, 'patient', 'bookpatient3@medlink.demo');
    const res = await request(app).post('/api/appointments').set('Cookie', secondPatientCookies).send({
      doctorId, slotStart: firstSlot.start, slotEnd: firstSlot.end,
    });

    expect(res.status).toBe(409);
  });

  it('rejects a doctor trying to book', async () => {
    const app = createApp();
    const doctorId = await seedDoctorWithAvailability(app);
    const docCookies = await registerAndLogin(app, 'doctor', 'bookingdoc2@medlink.demo');
    const res = await request(app).post('/api/appointments').set('Cookie', docCookies).send({
      doctorId, slotStart: '2026-08-05T18:00:00.000Z', slotEnd: '2026-08-05T18:15:00.000Z',
    });
    expect(res.status).toBe(403);
  });
});
