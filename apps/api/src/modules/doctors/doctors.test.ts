import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import path from 'node:path';
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
  for (const key of Object.keys(collections)) await collections[key].deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function registerAndLogin(app: Express, role: string, email: string) {
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'Dr A', phone: '9999999999', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return res.headers['set-cookie'] as unknown as string[];
}

const validProfile = {
  specialties: ['Dermatology'], qualifications: ['MBBS', 'MD'], regNo: 'DMC/R/00099',
  experienceYears: 9, bio: 'Experienced dermatologist.', clinicName: 'Skin Clinic',
  clinicAddress: '123 Main Rd', city: 'Noida', geo: { lat: 28.5, lng: 77.3 },
  consultationFee: 600, languages: ['English', 'Hindi'],
};

describe('PUT /api/doctors/me', () => {
  it('upserts the doctor profile, defaulting verificationStatus to pending', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'doc1@medlink.demo');
    const res = await request(app).put('/api/doctors/me').set('Cookie', cookies).send(validProfile);
    expect(res.status).toBe(200);
    expect(res.body.profile.verificationStatus).toBe('pending');
  });
});

describe('GET /api/doctors/public/:id', () => {
  it('returns 404 for a profile that is not approved', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'doc2@medlink.demo');
    const putRes = await request(app).put('/api/doctors/me').set('Cookie', cookies).send(validProfile);
    const res = await request(app).get(`/api/doctors/public/${putRes.body.profile._id}`);
    expect(res.status).toBe(404);
  });

  it('returns the profile once approved', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'doc3@medlink.demo');
    const putRes = await request(app).put('/api/doctors/me').set('Cookie', cookies).send(validProfile);
    await DoctorProfile.findByIdAndUpdate(putRes.body.profile._id, { verificationStatus: 'approved' });

    const res = await request(app).get(`/api/doctors/public/${putRes.body.profile._id}`);
    expect(res.status).toBe(200);
    expect(res.body.profile.clinicName).toBe('Skin Clinic');
  });
});

describe('POST /api/doctors/me/verification-docs', () => {
  it('appends an uploaded file path to verificationDocs', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'doc4@medlink.demo');
    await request(app).put('/api/doctors/me').set('Cookie', cookies).send(validProfile);

    const res = await request(app)
      .post('/api/doctors/me/verification-docs')
      .set('Cookie', cookies)
      .attach('docs', Buffer.from('%PDF-1.4 fake'), 'reg-cert.pdf');

    expect(res.status).toBe(200);
    expect(res.body.profile.verificationDocs.length).toBe(1);
  });
});
