import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { resetTestRedis } from '../../test-utils/resetRateLimit';
import { sendTriageMessage } from './triage.service';
import * as aiClientModule from './aiClient';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
beforeEach(async () => {
  await resetTestRedis();
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
  vi.restoreAllMocks();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('sendTriageMessage', () => {
  it('creates a new session and asks the first clarifying question on the initial message', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();
    const session = await sendTriageMessage(patientId, undefined, 'itchy red patches on my elbow');

    expect(session.messages).toHaveLength(2); // user message + assistant question
    expect(session.messages[0]!.role).toBe('user');
    expect(session.messages[1]!.role).toBe('assistant');
    expect(session.messages[1]!.text.toLowerCase()).toContain('how long');
    expect(session.disclaimerShownAt).toBeInstanceOf(Date);
    expect(session.isRedFlag).toBe(false);
  });

  it('asks the second clarifying question after the duration answer', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();
    const first = await sendTriageMessage(patientId, undefined, 'itchy red patches');
    const second = await sendTriageMessage(patientId, first._id.toString(), '2 weeks');

    expect(second.messages).toHaveLength(4);
    expect(second.messages[3]!.text.toLowerCase()).toMatch(/severe|mild|moderate/);
  });

  it('calls the AI service and returns specialties after the severity answer', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();
    vi.spyOn(aiClientModule, 'callTriageAI').mockResolvedValue({
      emergency: false,
      extractedSymptoms: ['itchy red patches'],
      suggestedSpecialties: [{ name: 'Dermatology', confidence: 0.87 }],
    });

    const first = await sendTriageMessage(patientId, undefined, 'itchy red patches');
    const second = await sendTriageMessage(patientId, first._id.toString(), '2 weeks');
    const third = await sendTriageMessage(patientId, second._id.toString(), 'mild');

    expect(third.suggestedSpecialties).toHaveLength(1);
    expect(third.suggestedSpecialties[0]!.name).toBe('Dermatology');
    expect(third.extractedSymptoms).toContain('itchy red patches');
  });

  it('short-circuits to an emergency response on the very first message, skipping clarifying questions', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();
    vi.spyOn(aiClientModule, 'callTriageAI').mockResolvedValue({
      emergency: true,
      message: 'Seek emergency care immediately or call 112.',
      extractedSymptoms: [],
      suggestedSpecialties: [],
    });

    const session = await sendTriageMessage(patientId, undefined, 'crushing chest pain');

    expect(session.isRedFlag).toBe(true);
    expect(session.messages).toHaveLength(2);
    expect(session.messages[1]!.text).toContain('112');
  });

  it('rejects continuing a session that belongs to a different patient', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();
    const otherPatientId = new mongoose.Types.ObjectId().toString();
    const first = await sendTriageMessage(patientId, undefined, 'itchy patches');

    await expect(sendTriageMessage(otherPatientId, first._id.toString(), '2 weeks')).rejects.toThrow();
  });
});
