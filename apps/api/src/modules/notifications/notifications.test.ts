import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { listNotificationsForUser, markNotificationRead } from './notifications.service';
import { Notification } from '../../models/Notification';
import { User } from '../../models/User';
import { createApp } from '../../app';
import { resetTestRedis } from '../../test-utils/resetRateLimit';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  await resetTestRedis();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('listNotificationsForUser', () => {
  it('returns only the requesting user\'s own notifications with an unread count', async () => {
    const user = await User.create({ role: 'patient', email: `u-${Date.now()}@medlink.demo`, phone: '1', passwordHash: 'x', name: 'U' });
    const other = await User.create({ role: 'patient', email: `o-${Date.now()}@medlink.demo`, phone: '2', passwordHash: 'x', name: 'O' });
    await Notification.create({ userId: user._id, type: 't', title: 'A', body: 'a' });
    await Notification.create({ userId: user._id, type: 't', title: 'B', body: 'b', readAt: new Date() });
    await Notification.create({ userId: other._id, type: 't', title: 'C', body: 'c' });

    const result = await listNotificationsForUser(user._id.toString(), 1, 20);
    expect(result.total).toBe(2);
    expect(result.unreadCount).toBe(1);
  });
});

describe('markNotificationRead', () => {
  it('marks the owning user\'s notification as read', async () => {
    const user = await User.create({ role: 'patient', email: `u2-${Date.now()}@medlink.demo`, phone: '3', passwordHash: 'x', name: 'U2' });
    const notification = await Notification.create({ userId: user._id, type: 't', title: 'A', body: 'a' });

    const updated = await markNotificationRead(user._id.toString(), notification._id.toString());
    expect(updated.readAt).toBeDefined();
  });

  it('rejects marking a different user\'s notification as read', async () => {
    const owner = await User.create({ role: 'patient', email: `own-${Date.now()}@medlink.demo`, phone: '4', passwordHash: 'x', name: 'Own' });
    const other = await User.create({ role: 'patient', email: `oth-${Date.now()}@medlink.demo`, phone: '5', passwordHash: 'x', name: 'Oth' });
    const notification = await Notification.create({ userId: owner._id, type: 't', title: 'A', body: 'a' });

    await expect(markNotificationRead(other._id.toString(), notification._id.toString())).rejects.toMatchObject({ statusCode: 404 });
  });
});

async function registerAndLogin(app: Express, role: 'doctor' | 'patient' | 'lab', email: string): Promise<string[]> {
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'Test User', phone: '9999999999', role });
  const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return loginRes.headers['set-cookie'] as unknown as string[];
}

describe('GET /api/notifications/me and PATCH /api/notifications/:id/read', () => {
  it('lets a user list and mark-read only their own notifications', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', `notif-http-${Date.now()}@medlink.demo`);
    const user = await User.findOne({ email: /notif-http-/ }).sort({ _id: -1 });
    await Notification.create({ userId: user!._id, type: 't', title: 'Hi', body: 'body' });

    const listRes = await request(app).get('/api/notifications/me').set('Cookie', cookies);
    expect(listRes.status).toBe(200);
    expect(listRes.body.unreadCount).toBe(1);

    const notificationId = listRes.body.items[0]._id;
    const readRes = await request(app).patch(`/api/notifications/${notificationId}/read`).set('Cookie', cookies);
    expect(readRes.status).toBe(200);
    expect(readRes.body.notification.readAt).toBeDefined();
  });
});
