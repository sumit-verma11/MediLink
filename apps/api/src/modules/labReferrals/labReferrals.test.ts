import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { createReferral, getReferralByToken, listReferralsForDoctor, listReferralsForLab } from './labReferrals.service';
import { User } from '../../models/User';
import { DoctorProfile } from '../../models/DoctorProfile';
import { LabProfile } from '../../models/LabProfile';
import { Prescription } from '../../models/Prescription';
import { LabReferral } from '../../models/LabReferral';
import { Notification } from '../../models/Notification';
import { createApp } from '../../app';
import { resetTestRedis } from '../../test-utils/resetRateLimit';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await LabReferral.init();
});
beforeEach(async () => {
  await resetTestRedis();
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function seedPrescriptionAndLab() {
  const doctorUser = await User.create({ role: 'doctor', email: `doc-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Dr Test' });
  const patientUser = await User.create({ role: 'patient', email: `pat-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Patient Test' });
  const doctorProfile = await DoctorProfile.create({
    userId: doctorUser._id, specialties: ['General Physician'], qualifications: ['MBBS'], regNo: 'DMC/R/12345',
    experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 },
    consultationFee: 500, languages: ['English'], verificationStatus: 'approved', avgRating: 4.5,
  });
  const labUser = await User.create({ role: 'lab', email: `lab-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'HealthFirst' });
  const labProfile = await LabProfile.create({
    userId: labUser._id, labName: 'HealthFirst Diagnostics', address: 'A', city: 'Noida',
    geo: { lat: 1, lng: 1 }, timings: '07:00-21:00', homeCollection: true, verificationStatus: 'approved',
    tests: [{ code: 'CBC', name: 'Complete Blood Count', price: 250, turnaroundHours: 6 }],
  });
  const prescription = await Prescription.create({
    appointmentId: new mongoose.Types.ObjectId(), doctorId: doctorProfile._id, patientId: patientUser._id,
    diagnosisNote: 'x', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
    recommendedTests: [{ testName: 'Complete Blood Count' }],
  });
  return { doctorUser, patientUser, doctorProfile, labProfile, prescription };
}

describe('createReferral', () => {
  it('creates a referral with an unguessable token and notifies the patient', async () => {
    const { doctorUser, patientUser, prescription, labProfile } = await seedPrescriptionAndLab();

    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);

    expect(referral.token).toBeTruthy();
    expect(referral.token.length).toBeGreaterThanOrEqual(20);
    expect(referral.status).toBe('sent');
    expect(referral.suggestedTestCodes).toEqual(['CBC']);
    expect(referral.patientId.toString()).toBe(patientUser._id.toString());

    const updatedPrescription = await Prescription.findById(prescription._id);
    expect(updatedPrescription!.recommendedTests[0]!.labReferralId!.toString()).toBe(referral._id.toString());

    const notifications = await Notification.find({ userId: patientUser._id });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.link).toBe(`/r/${referral.token}`);
  });

  it('rejects a doctor who did not write the prescription', async () => {
    const { prescription, labProfile } = await seedPrescriptionAndLab();
    const otherDoctorUser = await User.create({ role: 'doctor', email: `other-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Dr Other' });
    await DoctorProfile.create({
      userId: otherDoctorUser._id, specialties: ['Cardiology'], qualifications: ['MBBS'], regNo: 'DMC/R/54321',
      experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 },
      consultationFee: 500, languages: ['English'], verificationStatus: 'approved', avgRating: 4.5,
    });

    await expect(
      createReferral(otherDoctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC'])
    ).rejects.toThrow();
  });

  it('rejects a lab that does not offer the requested test code', async () => {
    const { doctorUser, prescription, labProfile } = await seedPrescriptionAndLab();

    await expect(
      createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['LFT'])
    ).rejects.toThrow();
  });
});

describe('getReferralByToken', () => {
  it('returns the lab, referred tests, and total price, marking the referral opened on first view', async () => {
    const { doctorUser, prescription, labProfile } = await seedPrescriptionAndLab();
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    expect(referral.status).toBe('sent');

    const result = await getReferralByToken(referral.token);

    expect(result).not.toBeNull();
    expect(result!.lab.labName).toBe('HealthFirst Diagnostics');
    expect(result!.tests).toHaveLength(1);
    expect(result!.tests[0]!.code).toBe('CBC');
    expect(result!.totalPrice).toBe(250);

    const reloaded = await LabReferral.findById(referral._id);
    expect(reloaded!.status).toBe('opened');
    expect(reloaded!.timeline.map((t) => t.status)).toContain('opened');
  });

  it('does not regress status from booked/further back to opened on a re-view', async () => {
    const { doctorUser, prescription, labProfile } = await seedPrescriptionAndLab();
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    await LabReferral.findByIdAndUpdate(referral._id, { status: 'booked', $push: { timeline: { status: 'booked', at: new Date() } } });

    await getReferralByToken(referral.token);

    const reloaded = await LabReferral.findById(referral._id);
    expect(reloaded!.status).toBe('booked');
  });

  it('returns null for an unknown token', async () => {
    const result = await getReferralByToken('nonexistent-token-xyz');
    expect(result).toBeNull();
  });

  it('returns null (existence-blind) for a referral whose token has expired (I7)', async () => {
    const { doctorUser, prescription, labProfile } = await seedPrescriptionAndLab();
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    expect(referral.expiresAt).toBeTruthy();

    await LabReferral.findByIdAndUpdate(referral._id, { expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) });

    const result = await getReferralByToken(referral.token);
    expect(result).toBeNull();
  });
});

describe('listReferralsForDoctor', () => {
  it('returns only the requesting doctor\'s own referrals, paginated', async () => {
    const { doctorUser, prescription, labProfile } = await seedPrescriptionAndLab();
    await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);

    const result = await listReferralsForDoctor(doctorUser._id.toString(), 1, 20);
    expect(result.total).toBe(1);
    expect(result.items[0]!.suggestedTestCodes).toEqual(['CBC']);
  });
});

async function registerAndLogin(app: Express, role: 'doctor' | 'patient' | 'lab', email: string): Promise<string[]> {
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'Test User', phone: '9999999999', role });
  const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return loginRes.headers['set-cookie'] as unknown as string[];
}

async function seedPrescriptionAndLabHttp(app: Express) {
  const doctorEmail = `doc-http-${Date.now()}-${Math.random()}@medlink.demo`;
  const doctorCookies = await registerAndLogin(app, 'doctor', doctorEmail);
  const doctorUser = await User.findOne({ email: doctorEmail });
  const doctorProfile = await DoctorProfile.create({
    userId: doctorUser!._id, specialties: ['General Physician'], qualifications: ['MBBS'], regNo: `DMC/R/${Math.floor(Math.random() * 100000)}`,
    experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 },
    consultationFee: 500, languages: ['English'], verificationStatus: 'approved', avgRating: 4.5,
  });
  const patientUser = await User.create({ role: 'patient', email: `pat-http-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Patient Test' });
  const labUser = await User.create({ role: 'lab', email: `lab-http-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'HealthFirst' });
  const labProfile = await LabProfile.create({
    userId: labUser._id, labName: 'HealthFirst Diagnostics', address: 'A', city: 'Noida',
    geo: { lat: 1, lng: 1 }, timings: '07:00-21:00', homeCollection: true, verificationStatus: 'approved',
    tests: [{ code: 'CBC', name: 'Complete Blood Count', price: 250, turnaroundHours: 6 }],
  });
  const prescription = await Prescription.create({
    appointmentId: new mongoose.Types.ObjectId(), doctorId: doctorProfile._id, patientId: patientUser._id,
    diagnosisNote: 'x', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
    recommendedTests: [{ testName: 'Complete Blood Count' }],
  });
  return { doctorCookies, doctorUser, patientUser, labProfile, prescription };
}

describe('listReferralsForLab', () => {
  it('returns only the requesting lab\'s own referrals, paginated', async () => {
    const { doctorUser, prescription, labProfile } = await seedPrescriptionAndLab();
    await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);

    const { doctorUser: otherDoctorUser, prescription: otherPrescription, labProfile: otherLabProfile } = await seedPrescriptionAndLab();
    await createReferral(otherDoctorUser._id.toString(), otherPrescription._id.toString(), otherLabProfile._id.toString(), ['CBC']);

    const result = await listReferralsForLab(labProfile.userId.toString(), 1, 20);

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.labId.toString()).toBe(labProfile._id.toString());
    expect(result.items[0]!.suggestedTestCodes).toEqual(['CBC']);
  });
});

describe('createReferral notifications', () => {
  it('notifies both the patient and the referred lab', async () => {
    const { doctorUser, patientUser, prescription, labProfile } = await seedPrescriptionAndLab();

    await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);

    const patientNotifications = await Notification.find({ userId: patientUser._id, type: 'lab_referral_sent' });
    expect(patientNotifications).toHaveLength(1);

    const labNotifications = await Notification.find({ userId: labProfile.userId, type: 'lab_referral_received' });
    expect(labNotifications).toHaveLength(1);
    expect(labNotifications[0]!.title).toBe('New lab referral');
    expect(labNotifications[0]!.body).toContain('CBC');
  });
});

describe('POST /api/lab-referrals', () => {
  it('lets a doctor create a referral for their own prescription', async () => {
    const app = createApp();
    const { doctorCookies, prescription, labProfile } = await seedPrescriptionAndLabHttp(app);

    const res = await request(app).post('/api/lab-referrals').set('Cookie', doctorCookies).send({
      prescriptionId: prescription._id.toString(),
      labId: labProfile._id.toString(),
      testCodes: ['CBC'],
    });

    expect(res.status).toBe(201);
    expect(res.body.referral.status).toBe('sent');
    expect(res.body.referral.suggestedTestCodes).toEqual(['CBC']);
  });

  it('rejects a patient trying to create a referral', async () => {
    const app = createApp();
    const patientCookies = await registerAndLogin(app, 'patient', `pat-reject-${Date.now()}@medlink.demo`);

    const res = await request(app).post('/api/lab-referrals').set('Cookie', patientCookies).send({
      prescriptionId: new mongoose.Types.ObjectId().toString(),
      labId: new mongoose.Types.ObjectId().toString(),
      testCodes: ['CBC'],
    });

    expect(res.status).toBe(403);
  });

  it('rejects a request missing prescriptionId with a validation error', async () => {
    const app = createApp();
    const { doctorCookies, labProfile } = await seedPrescriptionAndLabHttp(app);

    const res = await request(app).post('/api/lab-referrals').set('Cookie', doctorCookies).send({
      labId: labProfile._id.toString(),
      testCodes: ['CBC'],
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/lab-referrals/me', () => {
  it('returns the requesting doctor\'s own referrals, paginated', async () => {
    const app = createApp();
    const { doctorCookies, prescription, labProfile } = await seedPrescriptionAndLabHttp(app);
    await request(app).post('/api/lab-referrals').set('Cookie', doctorCookies).send({
      prescriptionId: prescription._id.toString(),
      labId: labProfile._id.toString(),
      testCodes: ['CBC'],
    });

    const res = await request(app).get('/api/lab-referrals/me').set('Cookie', doctorCookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].suggestedTestCodes).toEqual(['CBC']);
  });
});

describe('GET /api/r/:token', () => {
  it('is publicly reachable with no auth cookie', async () => {
    const app = createApp();
    const res = await request(app).get('/api/r/nonexistent-token');
    expect(res.status).toBe(404);
  });

  it('returns the lab, referred tests, and total price for a real token with no auth cookie', async () => {
    const app = createApp();
    const { doctorCookies, prescription, labProfile } = await seedPrescriptionAndLabHttp(app);
    const createRes = await request(app).post('/api/lab-referrals').set('Cookie', doctorCookies).send({
      prescriptionId: prescription._id.toString(),
      labId: labProfile._id.toString(),
      testCodes: ['CBC'],
    });
    const token = createRes.body.referral.token;

    const res = await request(app).get(`/api/r/${token}`);

    expect(res.status).toBe(200);
    expect(res.body.lab.labName).toBe('HealthFirst Diagnostics');
    expect(res.body.totalPrice).toBe(250);
  });
});
