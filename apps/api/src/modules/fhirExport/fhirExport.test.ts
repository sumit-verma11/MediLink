import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../app';
import { resetTestRedis } from '../../test-utils/resetRateLimit';
import { AuditLog } from '../../models/AuditLog';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
beforeEach(async () => { await resetTestRedis(); });
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
  return { cookies: res.headers['set-cookie'] as unknown as string[], body: res.body };
}

describe('GET /api/fhir/Patient/:patientId/$everything-lite', () => {
  it('401s with no session', async () => {
    const app = createApp();
    const res = await request(app).get(`/api/fhir/Patient/${new mongoose.Types.ObjectId()}/$everything-lite`);
    expect(res.status).toBe(401);
  });

  it('200s for a patient exporting their own data', async () => {
    const app = createApp();
    const { cookies, body } = await registerAndLogin(app, 'patient', 'self@medlink.demo');
    const res = await request(app).get(`/api/fhir/Patient/${body.user.id}/$everything-lite`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
  });

  it('403s for a patient exporting someone else\'s data', async () => {
    const app = createApp();
    const { cookies: selfCookies } = await registerAndLogin(app, 'patient', 'self2@medlink.demo');
    const other = await registerAndLogin(app, 'patient', 'other2@medlink.demo');
    const res = await request(app).get(`/api/fhir/Patient/${other.body.user.id}/$everything-lite`).set('Cookie', selfCookies);
    expect(res.status).toBe(403);
  });

  it('403s for a lab account (blocked at the router)', async () => {
    const app = createApp();
    const { cookies: labCookies } = await registerAndLogin(app, 'lab', 'lab@medlink.demo');
    const res = await request(app).get(`/api/fhir/Patient/${new mongoose.Types.ObjectId()}/$everything-lite`).set('Cookie', labCookies);
    expect(res.status).toBe(403);
  });

  it('200s and writes an AuditLog row for admin exporting any patient', async () => {
    const app = createApp();
    const patient = await registerAndLogin(app, 'patient', 'p3@medlink.demo');
    const admin = await registerAndLogin(app, 'admin', 'admin3@medlink.demo');
    const res = await request(app).get(`/api/fhir/Patient/${patient.body.user.id}/$everything-lite`).set('Cookie', admin.cookies);
    expect(res.status).toBe(200);
    const logs = await AuditLog.find({ action: 'fhir_export' });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.actorRole).toBe('admin');
  });

  it('404s for a patientId that is not a patient user', async () => {
    const app = createApp();
    const admin = await registerAndLogin(app, 'admin', 'admin4@medlink.demo');
    const res = await request(app).get(`/api/fhir/Patient/${new mongoose.Types.ObjectId()}/$everything-lite`).set('Cookie', admin.cookies);
    expect(res.status).toBe(404);
  });
});
