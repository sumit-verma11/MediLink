import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createNotification } from './notifications';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import * as telegramLib from './telegram';

vi.mock('./telegram', async () => {
  const actual = await vi.importActual<typeof telegramLib>('./telegram');
  return { ...actual, sendTelegramMessage: vi.fn() };
});

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
beforeEach(() => {
  vi.mocked(telegramLib.sendTelegramMessage).mockClear();
});
afterEach(async () => {
  await Notification.deleteMany({});
  await User.deleteMany({});
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

  it('sends a Telegram message when the target user has a linked chatId', async () => {
    const user = await User.create({ role: 'patient', email: `x${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'h', name: 'X', telegramChatId: '555' });
    await createNotification({ userId: user._id.toString(), type: 'lab_report_ready', title: 'T', body: 'B' });
    expect(telegramLib.sendTelegramMessage).toHaveBeenCalledWith('555', 'T\n\nB');
  });

  it('does not send a Telegram message when the target user has no linked chatId', async () => {
    const user = await User.create({ role: 'patient', email: `y${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'h', name: 'Y' });
    await createNotification({ userId: user._id.toString(), type: 'lab_report_ready', title: 'T', body: 'B' });
    expect(telegramLib.sendTelegramMessage).not.toHaveBeenCalled();
  });
});
