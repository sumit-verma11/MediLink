import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import path from 'node:path';
import type { Express } from 'express';
import { createApp } from '../../app';
import { resetTestRedis } from '../../test-utils/resetRateLimit';
import { DoctorProfile } from '../../models/DoctorProfile';
import { User } from '../../models/User';
import { Appointment } from '../../models/Appointment';
import { Rating } from '../../models/Rating';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
beforeEach(async () => {
  // Shared helper: fresh Redis + flushed store, so the auth rate-limit budget starts
  // empty for every test in this file. See src/test-utils/resetRateLimit.ts.
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

async function registerAndLogin(app: Express, role: string, email: string) {
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'Dr A', phone: '9999999999', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return res.headers['set-cookie'] as unknown as string[];
}

const validProfile = {
  specialties: ['Dermatology'], qualifications: ['MBBS', 'MD'], regNo: 'DMC/R/00099',
  experienceYears: 9, bio: 'Experienced dermatologist.', clinicName: 'Skin Clinic',
  clinicAddress: '123 Main Rd', city: 'Noida', geo: { lat: 28.5, lng: 77.3 },
  consultationFee: 600, languages: ['English', 'Hindi'],
};

describe('PUT /api/doctors/me', () => {
  it('upserts the doctor profile, defaulting verificationStatus to pending', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'doc1@medlink.demo');
    const res = await request(app).put('/api/doctors/me').set('Cookie', cookies).send(validProfile);
    expect(res.status).toBe(200);
    expect(res.body.profile.verificationStatus).toBe('pending');
  });
});

describe('GET /api/doctors/public/:id', () => {
  it('returns 404 for a profile that is not approved', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'doc2@medlink.demo');
    const putRes = await request(app).put('/api/doctors/me').set('Cookie', cookies).send(validProfile);
    const res = await request(app).get(`/api/doctors/public/${putRes.body.profile._id}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 (not 500) for a malformed ObjectId', async () => {
    const app = createApp();
    const res = await request(app).get('/api/doctors/public/not-a-valid-object-id');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns the profile once approved', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'doc3@medlink.demo');
    const putRes = await request(app).put('/api/doctors/me').set('Cookie', cookies).send(validProfile);
    await DoctorProfile.findByIdAndUpdate(putRes.body.profile._id, { verificationStatus: 'approved' });

    const res = await request(app).get(`/api/doctors/public/${putRes.body.profile._id}`);
    expect(res.status).toBe(200);
    expect(res.body.profile.clinicName).toBe('Skin Clinic');
    // The doctor's display name lives on the linked User doc; the public
    // profile response must populate it so frontend consumers (e.g. the
    // triage recommendation cards) don't need a second lookup.
    expect(res.body.profile.userId.name).toBe('Dr A');
  });
});

describe('POST /api/doctors/me/verification-docs', () => {
  it('appends an uploaded file path to verificationDocs', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'doc4@medlink.demo');
    await request(app).put('/api/doctors/me').set('Cookie', cookies).send(validProfile);

    const res = await request(app)
      .post('/api/doctors/me/verification-docs')
      .set('Cookie', cookies)
      .attach('docs', Buffer.from('%PDF-1.4 fake'), 'reg-cert.pdf');

    expect(res.status).toBe(200);
    expect(res.body.profile.verificationDocs.length).toBe(1);
  });

  it('rejects a disallowed mimetype with 400 (not 500)', async () => {
    const app = createApp();
    const cookies = await registerAndLogin(app, 'doctor', 'doc5@medlink.demo');
    await request(app).put('/api/doctors/me').set('Cookie', cookies).send(validProfile);

    const res = await request(app)
      .post('/api/doctors/me/verification-docs')
      .set('Cookie', cookies)
      .attach('docs', Buffer.from('plain text, not a permitted document'), 'notes.txt');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_FILE_TYPE');
  });
});

describe('GET /api/doctors', () => {
  it('filters approved doctors by specialty and city, and excludes pending/rejected ones', async () => {
    const app = createApp();
    await DoctorProfile.create({
      userId: (await User.create({ role: 'doctor', email: `d1-${Date.now()}@medlink.demo`, phone: '1', passwordHash: 'x', name: 'Dr. Approved' }))._id,
      specialties: ['Dermatology'], qualifications: ['MBBS'], regNo: 'DMC/R/00001', experienceYears: 5, bio: 'b',
      clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 500,
      languages: ['English'], verificationStatus: 'approved',
    });
    await DoctorProfile.create({
      userId: (await User.create({ role: 'doctor', email: `d2-${Date.now()}@medlink.demo`, phone: '2', passwordHash: 'x', name: 'Dr. Pending' }))._id,
      specialties: ['Dermatology'], qualifications: ['MBBS'], regNo: 'DMC/R/00002', experienceYears: 5, bio: 'b',
      clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 500,
      languages: ['English'], verificationStatus: 'pending',
    });

    const res = await request(app).get('/api/doctors').query({ specialty: 'Dermatology', city: 'Noida' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].userId.name).toBe('Dr. Approved');
  });

  it('paginates deterministically when every doctor ties on avgRating (regression: page 2 re-returning page 1 docs)', async () => {
    const app = createApp();
    // All default to avgRating: 0 -- a real-world state, since most seeded doctors have
    // no ratings yet. Without a unique tiebreaker after avgRating, Mongo does not
    // guarantee stable ordering for tied documents across separate skip/limit calls, so
    // paging forward could silently re-return page 1's doctors instead of new ones.
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const profile = await DoctorProfile.create({
        userId: (await User.create({ role: 'doctor', email: `page-${i}-${Date.now()}@medlink.demo`, phone: `${i}`, passwordHash: 'x', name: `Dr. Page ${i}` }))._id,
        specialties: ['Psychiatry'], qualifications: ['MBBS'], regNo: `DMC/R/0010${i}`, experienceYears: 5, bio: 'b',
        clinicName: 'C', clinicAddress: 'A', city: 'Ghaziabad', geo: { lat: 1, lng: 1 }, consultationFee: 500,
        languages: ['English'], verificationStatus: 'approved',
      });
      ids.push(profile._id.toString());
    }

    const page1 = await request(app).get('/api/doctors').query({ specialty: 'Psychiatry', city: 'Ghaziabad', limit: 2, page: 1 });
    const page2 = await request(app).get('/api/doctors').query({ specialty: 'Psychiatry', city: 'Ghaziabad', limit: 2, page: 2 });

    const page1Ids = page1.body.items.map((d: { _id: string }) => d._id);
    const page2Ids = page2.body.items.map((d: { _id: string }) => d._id);
    expect(page1Ids).toHaveLength(2);
    expect(page2Ids).toHaveLength(2);
    expect(new Set([...page1Ids, ...page2Ids])).toEqual(new Set(ids));
  });

  it('treats regex metacharacters in the city filter literally, not as a wildcard', async () => {
    const app = createApp();
    await DoctorProfile.create({
      userId: (await User.create({ role: 'doctor', email: `d3-${Date.now()}@medlink.demo`, phone: '3', passwordHash: 'x', name: 'Dr. X' }))._id,
      specialties: ['Cardiology'], qualifications: ['MBBS'], regNo: 'DMC/R/00003', experienceYears: 5, bio: 'b',
      clinicName: 'C', clinicAddress: 'A', city: 'Delhi', geo: { lat: 1, lng: 1 }, consultationFee: 500,
      languages: ['English'], verificationStatus: 'approved',
    });

    const res = await request(app).get('/api/doctors').query({ city: '.*' });
    expect(res.body.total).toBe(0);
  });

  it('does not leak verificationDocs or regNo in the public list response (I1 regression)', async () => {
    const app = createApp();
    await DoctorProfile.create({
      userId: (await User.create({ role: 'doctor', email: `d4-${Date.now()}@medlink.demo`, phone: '4', passwordHash: 'x', name: 'Dr. Private' }))._id,
      specialties: ['Dermatology'], qualifications: ['MBBS'], regNo: 'DMC/R/09999', experienceYears: 5, bio: 'b',
      clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 500,
      languages: ['English'], verificationStatus: 'approved',
      verificationDocs: ['/uploads/verification-docs/secret-reg-cert.pdf'],
    });

    const res = await request(app).get('/api/doctors').query({ specialty: 'Dermatology' });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].verificationDocs).toBeUndefined();
    expect(res.body.items[0].regNo).toBeUndefined();
    // Fields the search UI does display must still be present.
    expect(res.body.items[0].specialties).toEqual(['Dermatology']);
    expect(res.body.items[0].city).toBe('Noida');
    expect(res.body.items[0].consultationFee).toBe(500);
    expect(res.body.items[0].userId.name).toBe('Dr. Private');
  });
});

describe('GET /api/doctors/me/analytics', () => {
  it('returns earnings, breakdown, rating trend, and patient volume for the caller\'s own profile', async () => {
    const app = createApp();
    const docCookies = await registerAndLogin(app, 'doctor', `analytics-doc-${Date.now()}@medlink.demo`);
    const putRes = await request(app).put('/api/doctors/me').set('Cookie', docCookies).send({
      ...validProfile, consultationFee: 500,
    });
    const doctorId = putRes.body.profile._id;
    await DoctorProfile.findByIdAndUpdate(doctorId, { verificationStatus: 'approved', avgRating: 4.5, ratingCount: 3 });

    const patient1 = await User.create({ role: 'patient', email: `p1-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'P1' });
    const patient2 = await User.create({ role: 'patient', email: `p2-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'P2' });
    const now = new Date();

    // 2 completed, 1 cancelled, 1 no_show -- within the 90-day window
    await Appointment.create([
      { patientId: patient1._id, doctorId, slotStart: now, slotEnd: now, status: 'completed' },
      { patientId: patient2._id, doctorId, slotStart: now, slotEnd: now, status: 'completed' },
      { patientId: patient1._id, doctorId, slotStart: now, slotEnd: now, status: 'cancelled' },
      { patientId: patient2._id, doctorId, slotStart: now, slotEnd: now, status: 'no_show' },
    ]);
    await Rating.create({ doctorId, patientId: patient1._id, appointmentId: new mongoose.Types.ObjectId(), score: 5, createdAt: now });

    const res = await request(app).get('/api/doctors/me/analytics').set('Cookie', docCookies);

    expect(res.status).toBe(200);
    expect(res.body.windowDays).toBe(90);
    expect(typeof res.body.disclaimer).toBe('string');

    // earnings: 2 completed this week * fee 500 = 1000, in exactly one weekly bucket
    expect(res.body.earningsByWeek).toHaveLength(1);
    expect(res.body.earningsByWeek[0].completedCount).toBe(2);
    expect(res.body.earningsByWeek[0].estimatedEarnings).toBe(1000);

    expect(res.body.appointmentBreakdown).toEqual({
      completed: 2, cancelled: 1, noShow: 1, rejected: 0, requested: 0, confirmed: 0,
    });
    // (cancelled + noShow) / (completed + cancelled + noShow + rejected) = 2/4 = 50%
    expect(res.body.noShowCancellationRate).toBe(50);

    expect(res.body.currentRating).toEqual({ avgRating: 4.5, ratingCount: 3 });
    expect(res.body.ratingTrend).toHaveLength(1);
    expect(res.body.ratingTrend[0].avgScore).toBe(5);

    expect(res.body.patientVolume.totalDistinctPatients).toBe(2);
    expect(res.body.patientVolume.newPatients).toBe(2);
    expect(res.body.patientVolume.returningPatients).toBe(0);
  });

  it('rejects an unauthenticated caller', async () => {
    const app = createApp();
    const res = await request(app).get('/api/doctors/me/analytics');
    expect(res.status).toBe(401);
  });

  it('returns 404 when the caller has no DoctorProfile yet', async () => {
    const app = createApp();
    const docCookies = await registerAndLogin(app, 'doctor', `noprofile-${Date.now()}@medlink.demo`);
    const res = await request(app).get('/api/doctors/me/analytics').set('Cookie', docCookies);
    expect(res.status).toBe(404);
  });

  it('never includes another doctor\'s appointments, ratings, or earnings', async () => {
    const app = createApp();

    const docACookies = await registerAndLogin(app, 'doctor', `iso-a-${Date.now()}@medlink.demo`);
    const putA = await request(app).put('/api/doctors/me').set('Cookie', docACookies).send({ ...validProfile, consultationFee: 500 });
    await DoctorProfile.findByIdAndUpdate(putA.body.profile._id, { verificationStatus: 'approved' });

    const docBCookies = await registerAndLogin(app, 'doctor', `iso-b-${Date.now()}@medlink.demo`);
    const putB = await request(app).put('/api/doctors/me').set('Cookie', docBCookies).send({ ...validProfile, consultationFee: 9999 });
    await DoctorProfile.findByIdAndUpdate(putB.body.profile._id, { verificationStatus: 'approved' });

    const patient = await User.create({ role: 'patient', email: `iso-p-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'P' });
    const now = new Date();
    // Only doctor B has any activity
    await Appointment.create({ patientId: patient._id, doctorId: putB.body.profile._id, slotStart: now, slotEnd: now, status: 'completed' });
    await Rating.create({ doctorId: putB.body.profile._id, patientId: patient._id, appointmentId: new mongoose.Types.ObjectId(), score: 4, createdAt: now });

    const resA = await request(app).get('/api/doctors/me/analytics').set('Cookie', docACookies);

    expect(resA.status).toBe(200);
    expect(resA.body.earningsByWeek).toHaveLength(0);
    expect(resA.body.appointmentBreakdown).toEqual({ completed: 0, cancelled: 0, noShow: 0, rejected: 0, requested: 0, confirmed: 0 });
    expect(resA.body.patientVolume.totalDistinctPatients).toBe(0);
    expect(resA.body.ratingTrend).toHaveLength(0);
  });

  it('returns a 0% no-show/cancellation rate with no error when the doctor has zero appointments', async () => {
    const app = createApp();
    const docCookies = await registerAndLogin(app, 'doctor', `empty-${Date.now()}@medlink.demo`);
    const putRes = await request(app).put('/api/doctors/me').set('Cookie', docCookies).send(validProfile);
    await DoctorProfile.findByIdAndUpdate(putRes.body.profile._id, { verificationStatus: 'approved' });

    const res = await request(app).get('/api/doctors/me/analytics').set('Cookie', docCookies);
    expect(res.status).toBe(200);
    expect(res.body.noShowCancellationRate).toBe(0);
  });

  it('classifies a patient as returning when their earlier appointment falls outside the 90-day window', async () => {
    const app = createApp();
    const docCookies = await registerAndLogin(app, 'doctor', `returning-${Date.now()}@medlink.demo`);
    const putRes = await request(app).put('/api/doctors/me').set('Cookie', docCookies).send(validProfile);
    const doctorId = putRes.body.profile._id;
    await DoctorProfile.findByIdAndUpdate(doctorId, { verificationStatus: 'approved' });

    const patient = await User.create({ role: 'patient', email: `ret-p-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'P' });
    const now = new Date();
    const beforeWindow = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000); // 120 days ago, outside the 90-day window

    await Appointment.create({ patientId: patient._id, doctorId, slotStart: beforeWindow, slotEnd: beforeWindow, status: 'completed' });
    await Appointment.create({ patientId: patient._id, doctorId, slotStart: now, slotEnd: now, status: 'completed' });

    const res = await request(app).get('/api/doctors/me/analytics').set('Cookie', docCookies);
    expect(res.body.patientVolume.totalDistinctPatients).toBe(1);
    expect(res.body.patientVolume.newPatients).toBe(0);
    expect(res.body.patientVolume.returningPatients).toBe(1);
  });
});
