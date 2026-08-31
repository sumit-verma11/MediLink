import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../app';
import { resetTestRedis } from '../../test-utils/resetRateLimit';
import { getRedis } from '../../lib/redis';
import { User } from '../../models/User';
import * as telegramLib from '../../lib/telegram';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret';

vi.mock('../../lib/telegram', async () => {
  const actual = await vi.importActual<typeof telegramLib>('../../lib/telegram');
  return { ...actual, sendTelegramMessage: vi.fn() };
});

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
beforeEach(async () => {
  await resetTestRedis();
  vi.mocked(telegramLib.sendTelegramMessage).mockClear();
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
  return { cookies: res.headers['set-cookie'] as unknown as string[], userId: res.body.user.id as string };
}

describe('POST /api/telegram/link-code', () => {
  it('returns a code and a deepLink containing that code, readable back from Redis', async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndLogin(app, 'patient', `link-${Date.now()}@medlink.demo`);

    const res = await request(app).post('/api/telegram/link-code').set('Cookie', cookies);

    expect(res.status).toBe(200);
    expect(res.body.code).toHaveLength(8);
    expect(res.body.deepLink).toContain(res.body.code);
    const stored = await getRedis().get(`telegram:link:${res.body.code}`);
    expect(stored).toBe(userId);
  });

  it('rejects an unauthenticated caller', async () => {
    const app = createApp();
    const res = await request(app).post('/api/telegram/link-code');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/telegram/webhook', () => {
  it('sets telegramChatId on the right user for /start <validCode>, and removes the code', async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndLogin(app, 'patient', `webhook-${Date.now()}@medlink.demo`);
    const linkRes = await request(app).post('/api/telegram/link-code').set('Cookie', cookies);
    const code = linkRes.body.code as string;

    const res = await request(app)
      .post('/api/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'test-webhook-secret')
      .send({ message: { text: `/start ${code}`, chat: { id: 555 } } });

    expect(res.status).toBe(200);
    const user = await User.findById(userId);
    expect(user!.telegramChatId).toBe('555');
    expect(await getRedis().get(`telegram:link:${code}`)).toBeNull();
  });

  it('does not set telegramChatId for an unknown/expired code, and tells the sender via sendTelegramMessage', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'test-webhook-secret')
      .send({ message: { text: '/start nonexistent', chat: { id: 999 } } });

    expect(res.status).toBe(200);
    expect(telegramLib.sendTelegramMessage).toHaveBeenCalledWith('999', expect.stringContaining('expired'));
  });

  it('rejects a request missing or mismatching the secret-token header with 404', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/telegram/webhook')
      .send({ message: { text: '/start whatever', chat: { id: 1 } } });

    expect(res.status).toBe(404);
    expect(telegramLib.sendTelegramMessage).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/telegram/link', () => {
  it('clears telegramChatId on the calling user', async () => {
    const app = createApp();
    const { cookies, userId } = await registerAndLogin(app, 'patient', `unlink-${Date.now()}@medlink.demo`);
    await User.findByIdAndUpdate(userId, { telegramChatId: '777' });

    const res = await request(app).delete('/api/telegram/link').set('Cookie', cookies);

    expect(res.status).toBe(200);
    const user = await User.findById(userId);
    expect(user!.telegramChatId).toBeUndefined();
  });
});
