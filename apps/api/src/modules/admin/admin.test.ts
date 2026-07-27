import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
import type { Express } from 'express';
import { createApp } from '../../app';
import { setRedisClient } from '../../lib/redis';
import { AuditLog } from '../../models/AuditLog';

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

const validDoctor = {
  specialties: ['Dermatology'], qualifications: ['MBBS'], regNo: 'DMC/R/00001',
  experienceYears: 5, bio: 'bio', clinicName: 'Clinic', clinicAddress: 'Addr',
  city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 500, languages: ['English'],
};

describe('GET /api/admin/verifications', () => {
  it('lists pending doctors only for an admin', async () => {
    const app = createApp();
    const docCookies = await registerAndLogin(app, 'doctor', 'pendingdoc@medlink.demo');
    await request(app).put('/api/doctors/me').set('Cookie', docCookies).send(validDoctor);
    const adminCookies = await registerAndLogin(app, 'admin', 'admin@medlink.demo');

    const res = await request(app).get('/api/admin/verifications?role=doctor&status=pending').set('Cookie', adminCookies);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.page).toBe(1);
  });

  it('rejects a non-admin with 403', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', 'notadmin@medlink.demo');
    const res = await request(app).get('/api/admin/verifications?role=doctor&status=pending').set('Cookie', cookies);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/verifications/:role/:id/decision', () => {
  it('approves a doctor and writes an audit log entry', async () => {
    const app = createApp();
    const docCookies = await registerAndLogin(app, 'doctor', 'approveme@medlink.demo');
    const putRes = await request(app).put('/api/doctors/me').set('Cookie', docCookies).send(validDoctor);
    const adminCookies = await registerAndLogin(app, 'admin', 'admin2@medlink.demo');

    const res = await request(app)
      .post(`/api/admin/verifications/doctor/${putRes.body.profile._id}/decision`)
      .set('Cookie', adminCookies)
      .send({ decision: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body.profile.verificationStatus).toBe('approved');

    const entries = await AuditLog.find({ action: 'verification.approved' });
    expect(entries).toHaveLength(1);
  });

  it('requires a reason when rejecting', async () => {
    const app = createApp();
    const docCookies = await registerAndLogin(app, 'doctor', 'rejectme@medlink.demo');
    const putRes = await request(app).put('/api/doctors/me').set('Cookie', docCookies).send(validDoctor);
    const adminCookies = await registerAndLogin(app, 'admin', 'admin3@medlink.demo');

    const res = await request(app)
      .post(`/api/admin/verifications/doctor/${putRes.body.profile._id}/decision`)
      .set('Cookie', adminCookies)
      .send({ decision: 'rejected' });

    expect(res.status).toBe(400);
  });
});
