import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createNotification } from './notifications';
import { Notification } from '../models/Notification';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterEach(async () => {
  await Notification.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('createNotification', () => {
  it('persists a notification with the given fields', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    await createNotification({
      userId,
      type: 'lab_referral_sent',
      title: 'Lab referral ready',
      body: 'Your doctor recommended a lab test.',
      link: '/r/abc123',
    });

    const notifications = await Notification.find({ userId });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.type).toBe('lab_referral_sent');
    expect(notifications[0]!.readAt).toBeUndefined();
  });
});
