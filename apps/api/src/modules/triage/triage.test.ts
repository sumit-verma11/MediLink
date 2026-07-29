import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../app';
import { resetTestRedis } from '../../test-utils/resetRateLimit';
import { sendTriageMessage } from './triage.service';
import * as aiClientModule from './aiClient';
import { AIServiceUnavailableError } from './aiClient';
import { User } from '../../models/User';
import { DoctorProfile } from '../../models/DoctorProfile';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

const DISCLAIMER = 'This is guidance, not medical advice.';

async function registerAndLogin(app: Express, role: string, email: string) {
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'A', phone: '9999999999', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return res.headers['set-cookie'] as unknown as string[];
}

async function createDoctor(opts: {
  specialties: string[];
  avgRating: number;
  verificationStatus: 'pending' | 'approved' | 'rejected';
}) {
  const doctorUser = await User.create({
    role: 'doctor',
    email: `doc-${Date.now()}-${Math.random()}@medlink.demo`,
    phone: '9999999999',
    passwordHash: 'x',
    name: 'Dr Test',
  });
  return DoctorProfile.create({
    userId: doctorUser._id,
    specialties: opts.specialties,
    qualifications: ['MBBS'],
    regNo: `DMC/R/${Math.floor(Math.random() * 100000)}`,
    experienceYears: 5,
    bio: 'b',
    clinicName: 'C',
    clinicAddress: 'A',
    city: 'Noida',
    geo: { lat: 1, lng: 1 },
    consultationFee: 500,
    languages: ['English'],
    verificationStatus: opts.verificationStatus,
    avgRating: opts.avgRating,
  });
}

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

  it('never calls the AI service for an ordinary first message (red-flag detection is now local)', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();
    const spy = vi.spyOn(aiClientModule, 'callTriageAI');

    const session = await sendTriageMessage(patientId, undefined, 'itchy red patches on my elbow');

    expect(session.messages).toHaveLength(2);
    expect(session.messages[1]!.role).toBe('assistant');
    expect(session.messages[1]!.text.toLowerCase()).toContain('how long');
    expect(session.messages[1]!.text).toContain(DISCLAIMER);
    expect(session.isRedFlag).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('asks the second clarifying question after the duration answer, with the disclaimer', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();
    const first = await sendTriageMessage(patientId, undefined, 'itchy red patches');
    const second = await sendTriageMessage(patientId, first._id.toString(), '2 weeks');

    expect(second.messages).toHaveLength(4);
    expect(second.messages[3]!.text.toLowerCase()).toMatch(/severe|mild|moderate/);
    expect(second.messages[3]!.text).toContain(DISCLAIMER);
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

  it('degrades gracefully with the disclaimer when the AI service is down on turn 3 (deliberately mocked)', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();
    const spy = vi.spyOn(aiClientModule, 'callTriageAI');
    // Only one AI call happens across the whole conversation: the turn-3
    // final match. Red-flag detection is local now, so turns 1 and 2 never
    // touch the AI at all.
    spy.mockRejectedValueOnce(new AIServiceUnavailableError('AI service down')); // turn 3

    const first = await sendTriageMessage(patientId, undefined, 'itchy red patches');
    const second = await sendTriageMessage(patientId, first._id.toString(), '2 weeks');
    const third = await sendTriageMessage(patientId, second._id.toString(), 'mild');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(third.suggestedSpecialties).toHaveLength(0);
    const finalMessage = third.messages[third.messages.length - 1]!;
    expect(finalMessage.role).toBe('assistant');
    expect(finalMessage.text.toLowerCase()).toContain('try again in a few minutes');
    expect(finalMessage.text).toContain(DISCLAIMER);
  });

  it('populates recommendedDoctorIds with only approved, specialty-matching doctors sorted by avgRating desc, capped at 3', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();

    const matchLow = await createDoctor({ specialties: ['Dermatology'], avgRating: 4.0, verificationStatus: 'approved' });
    const matchHigh = await createDoctor({ specialties: ['Dermatology'], avgRating: 4.8, verificationStatus: 'approved' });
    const matchMid = await createDoctor({ specialties: ['Dermatology'], avgRating: 4.5, verificationStatus: 'approved' });
    const matchLowest = await createDoctor({ specialties: ['Dermatology'], avgRating: 3.9, verificationStatus: 'approved' });
    await createDoctor({ specialties: ['Dermatology'], avgRating: 4.9, verificationStatus: 'pending' }); // excluded: not approved
    await createDoctor({ specialties: ['Cardiology'], avgRating: 4.9, verificationStatus: 'approved' }); // excluded: no specialty match

    vi.spyOn(aiClientModule, 'callTriageAI').mockResolvedValue({
      emergency: false,
      extractedSymptoms: ['itchy red patches'],
      suggestedSpecialties: [{ name: 'Dermatology', confidence: 0.87 }],
    });

    const first = await sendTriageMessage(patientId, undefined, 'itchy red patches');
    const second = await sendTriageMessage(patientId, first._id.toString(), '2 weeks');
    const third = await sendTriageMessage(patientId, second._id.toString(), 'mild');

    expect(third.recommendedDoctorIds).toHaveLength(3);
    expect(third.recommendedDoctorIds.map((id) => id.toString())).toEqual([
      matchHigh._id.toString(),
      matchMid._id.toString(),
      matchLow._id.toString(),
    ]);
    expect(third.recommendedDoctorIds.map((id) => id.toString())).not.toContain(matchLowest._id.toString());
  });

  it('short-circuits to an emergency response on the very first message, skipping clarifying questions and the AI entirely', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();
    const spy = vi.spyOn(aiClientModule, 'callTriageAI');

    const session = await sendTriageMessage(patientId, undefined, 'crushing chest pain');

    expect(session.isRedFlag).toBe(true);
    expect(session.messages).toHaveLength(2);
    expect(session.messages[1]!.text).toContain('112');
    expect(session.messages[1]!.text).not.toContain(DISCLAIMER);
    expect(spy).not.toHaveBeenCalled();
  });

  it('escalates mid-conversation: a red flag on turn 2 is caught even though turn 1 was benign (C1)', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();
    const spy = vi.spyOn(aiClientModule, 'callTriageAI');

    const first = await sendTriageMessage(patientId, undefined, 'I have a mild rash');
    expect(first.isRedFlag).toBe(false);

    const second = await sendTriageMessage(patientId, first._id.toString(), 'actually now I have crushing chest pain');

    expect(second.isRedFlag).toBe(true);
    const lastMessage = second.messages[second.messages.length - 1]!;
    expect(lastMessage.text).toContain('112');
    expect(lastMessage.text.toLowerCase()).not.toContain('how severe');
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a further message once a session has been red-flagged (terminal session)', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();
    const first = await sendTriageMessage(patientId, undefined, 'crushing chest pain');
    expect(first.isRedFlag).toBe(true);

    await expect(sendTriageMessage(patientId, first._id.toString(), 'anything else')).rejects.toMatchObject({
      statusCode: 409,
      code: 'TRIAGE_SESSION_CLOSED',
    });
  });

  it('rejects a 4th message once a session has completed its 3-turn flow (terminal session)', async () => {
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

    await expect(sendTriageMessage(patientId, third._id.toString(), 'one more thing')).rejects.toMatchObject({
      statusCode: 409,
      code: 'TRIAGE_SESSION_CLOSED',
    });
  });

  it('rejects continuing a session that belongs to a different patient', async () => {
    const patientId = new mongoose.Types.ObjectId().toString();
    const otherPatientId = new mongoose.Types.ObjectId().toString();
    const first = await sendTriageMessage(patientId, undefined, 'itchy patches');

    await expect(sendTriageMessage(otherPatientId, first._id.toString(), '2 weeks')).rejects.toThrow();
  });
});

describe('POST /api/triage/messages', () => {
  it('starts a new session for an authenticated patient', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', 'triagepatient@medlink.demo');
    const res = await request(app).post('/api/triage/messages').set('Cookie', cookies).send({ text: 'itchy red patches' });
    expect(res.status).toBe(201);
    expect(res.body.session.messages).toHaveLength(2);
  });

  it('rejects a doctor posting a triage message', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'triagedoc@medlink.demo');
    const res = await request(app).post('/api/triage/messages').set('Cookie', cookies).send({ text: 'test' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/triage/:id', () => {
  it('lets the owning patient fetch their session', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', 'triagepatient2@medlink.demo');
    const createRes = await request(app).post('/api/triage/messages').set('Cookie', cookies).send({ text: 'itchy patches' });
    const sessionId = createRes.body.session._id;

    const res = await request(app).get(`/api/triage/${sessionId}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.session._id).toBe(sessionId);
  });

  it('rejects a different patient reading someone else\'s session', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'patient', 'triagepatient3@medlink.demo');
    const createRes = await request(app).post('/api/triage/messages').set('Cookie', cookies).send({ text: 'itchy patches' });
    const sessionId = createRes.body.session._id;

    const otherCookies = await registerAndLogin(app, 'patient', 'triagepatient4@medlink.demo');
    const res = await request(app).get(`/api/triage/${sessionId}`).set('Cookie', otherCookies);
    expect(res.status).toBe(404);
  });
});
