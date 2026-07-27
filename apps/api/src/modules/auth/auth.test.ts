import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import RedisMock from 'ioredis-mock';
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
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('POST /api/auth/register', () => {
  it('creates a user and does not return the password', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/register').send({
      email: 'patient@medlink.demo', password: 'longenough1', name: 'Rahul', phone: '9999999999', role: 'patient',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('patient@medlink.demo');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects duplicate email with 409', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send({
      email: 'dup@medlink.demo', password: 'longenough1', name: 'A', phone: '9999999999', role: 'patient',
    });
    const res = await request(app).post('/api/auth/register').send({
      email: 'dup@medlink.demo', password: 'longenough1', name: 'B', phone: '9999999999', role: 'patient',
    });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  it('sets accessToken and refreshToken cookies on success', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send({
      email: 'login@medlink.demo', password: 'longenough1', name: 'A', phone: '9999999999', role: 'patient',
    });
    const res = await request(app).post('/api/auth/login').send({ email: 'login@medlink.demo', password: 'longenough1' });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('accessToken='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('refreshToken='))).toBe(true);
  });

  it('rejects wrong password with 401', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send({
      email: 'wrongpw@medlink.demo', password: 'longenough1', name: 'A', phone: '9999999999', role: 'patient',
    });
    const res = await request(app).post('/api/auth/login').send({ email: 'wrongpw@medlink.demo', password: 'incorrect1' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the refresh token and rejects reuse of the old one', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send({
      email: 'refresh@medlink.demo', password: 'longenough1', name: 'A', phone: '9999999999', role: 'patient',
    });
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'refresh@medlink.demo', password: 'longenough1' });
    const cookies = loginRes.headers['set-cookie'] as unknown as string[];

    const refreshRes = await request(app).post('/api/auth/refresh').set('Cookie', cookies);
    expect(refreshRes.status).toBe(200);
    const newCookies = refreshRes.headers['set-cookie'] as unknown as string[];
    expect(newCookies.some((c) => c.startsWith('refreshToken='))).toBe(true);

    // reusing the original (now-rotated-out) refresh cookie must fail
    const reuseRes = await request(app).post('/api/auth/refresh').set('Cookie', cookies);
    expect(reuseRes.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('blacklists the access token so it can no longer authenticate', async () => {
    const app = createApp();
    await request(app).post('/api/auth/register').send({
      email: 'logout@medlink.demo', password: 'longenough1', name: 'A', phone: '9999999999', role: 'patient',
    });
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'logout@medlink.demo', password: 'longenough1' });
    const cookies = loginRes.headers['set-cookie'] as unknown as string[];

    const logoutRes = await request(app).post('/api/auth/logout').set('Cookie', cookies);
    expect(logoutRes.status).toBe(200);

    const refreshAfterLogout = await request(app).post('/api/auth/refresh').set('Cookie', cookies);
    expect(refreshAfterLogout.status).toBe(401);
  });
});
