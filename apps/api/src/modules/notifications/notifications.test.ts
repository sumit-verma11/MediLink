import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { listNotificationsForUser, markNotificationRead } from './notifications.service';
import { Notification } from '../../models/Notification';
import { User } from '../../models/User';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
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
