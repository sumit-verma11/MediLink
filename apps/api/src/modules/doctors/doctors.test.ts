import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import path from 'node:path';
import type { Express } from 'express';
import { createApp } from '../../app';
import { resetTestRedis } from '../../test-utils/resetRateLimit';
import { DoctorProfile } from '../../models/DoctorProfile';
import { User } from '../../models/User';

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

  it('returns 404 (not 500) for a malformed ObjectId', async () => {
    const app = createApp();
    const res = await request(app).get('/api/doctors/public/not-a-valid-object-id');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns the profile once approved', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'doc3@medlink.demo');
    const putRes = await request(app).put('/api/doctors/me').set('Cookie', cookies).send(validProfile);
    await DoctorProfile.findByIdAndUpdate(putRes.body.profile._id, { verificationStatus: 'approved' });

    const res = await request(app).get(`/api/doctors/public/${putRes.body.profile._id}`);
    expect(res.status).toBe(200);
    expect(res.body.profile.clinicName).toBe('Skin Clinic');
    // The doctor's display name lives on the linked User doc; the public
    // profile response must populate it so frontend consumers (e.g. the
    // triage recommendation cards) don't need a second lookup.
    expect(res.body.profile.userId.name).toBe('Dr A');
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

  it('rejects a disallowed mimetype with 400 (not 500)', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'doc5@medlink.demo');
    await request(app).put('/api/doctors/me').set('Cookie', cookies).send(validProfile);

    const res = await request(app)
      .post('/api/doctors/me/verification-docs')
      .set('Cookie', cookies)
      .attach('docs', Buffer.from('plain text, not a permitted document'), 'notes.txt');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_FILE_TYPE');
  });
});

describe('GET /api/doctors', () => {
  it('filters approved doctors by specialty and city, and excludes pending/rejected ones', async () => {
    const app = createApp();
    await DoctorProfile.create({
      userId: (await User.create({ role: 'doctor', email: `d1-${Date.now()}@medlink.demo`, phone: '1', passwordHash: 'x', name: 'Dr. Approved' }))._id,
      specialties: ['Dermatology'], qualifications: ['MBBS'], regNo: 'DMC/R/00001', experienceYears: 5, bio: 'b',
      clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 500,
      languages: ['English'], verificationStatus: 'approved',
    });
    await DoctorProfile.create({
      userId: (await User.create({ role: 'doctor', email: `d2-${Date.now()}@medlink.demo`, phone: '2', passwordHash: 'x', name: 'Dr. Pending' }))._id,
      specialties: ['Dermatology'], qualifications: ['MBBS'], regNo: 'DMC/R/00002', experienceYears: 5, bio: 'b',
      clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 500,
      languages: ['English'], verificationStatus: 'pending',
    });

    const res = await request(app).get('/api/doctors').query({ specialty: 'Dermatology', city: 'Noida' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].userId.name).toBe('Dr. Approved');
  });

  it('treats regex metacharacters in the city filter literally, not as a wildcard', async () => {
    const app = createApp();
    await DoctorProfile.create({
      userId: (await User.create({ role: 'doctor', email: `d3-${Date.now()}@medlink.demo`, phone: '3', passwordHash: 'x', name: 'Dr. X' }))._id,
      specialties: ['Cardiology'], qualifications: ['MBBS'], regNo: 'DMC/R/00003', experienceYears: 5, bio: 'b',
      clinicName: 'C', clinicAddress: 'A', city: 'Delhi', geo: { lat: 1, lng: 1 }, consultationFee: 500,
      languages: ['English'], verificationStatus: 'approved',
    });

    const res = await request(app).get('/api/doctors').query({ city: '.*' });
    expect(res.body.total).toBe(0);
  });
});
