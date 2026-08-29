import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { createRating, createLabRating, listRatingsForDoctor, listRatingsForLab } from './ratings.service';
import { User } from '../../models/User';
import { DoctorProfile } from '../../models/DoctorProfile';
import { LabProfile } from '../../models/LabProfile';
import { LabBooking } from '../../models/LabBooking';
import { Appointment } from '../../models/Appointment';
import { Rating } from '../../models/Rating';
import { createApp } from '../../app';
import { resetTestRedis } from '../../test-utils/resetRateLimit';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Rating.init();
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  // Shared helper: fresh Redis + flushed store, so the auth rate-limit budget starts
  // empty for every test in this file. Needed by the HTTP-level tests below, which
  // register/log in real users via /api/auth/*. See src/test-utils/resetRateLimit.ts.
  await resetTestRedis();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

async function seedCompletedAppointment() {
  const doctorUser = await User.create({ role: 'doctor', email: `doc-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Dr. Test' });
  const doctorProfile = await DoctorProfile.create({
    userId: doctorUser._id, specialties: ['Dermatology'], qualifications: ['MBBS'], regNo: 'DMC/R/00001',
    experienceYears: 5, bio: 'bio', clinicName: 'Clinic', clinicAddress: 'Addr', city: 'Noida',
    geo: { lat: 1, lng: 1 }, consultationFee: 500, languages: ['English'], verificationStatus: 'approved',
  });
  const patientUser = await User.create({ role: 'patient', email: `pat-${Date.now()}@medlink.demo`, phone: '8888888888', passwordHash: 'x', name: 'Pat Test' });
  const appointment = await Appointment.create({
    patientId: patientUser._id, doctorId: doctorProfile._id,
    slotStart: new Date(Date.now() - 86400000), slotEnd: new Date(Date.now() - 86400000 + 900000),
    status: 'completed',
  });
  return { doctorProfile, patientUser, appointment };
}

describe('createRating', () => {
  it('creates a rating for a completed appointment and recomputes the doctor avgRating/ratingCount', async () => {
    const { doctorProfile, patientUser, appointment } = await seedCompletedAppointment();

    await createRating(patientUser._id.toString(), appointment._id.toString(), 4, 'Great doctor');
    const pat2 = await User.create({ role: 'patient', email: `pat2-${Date.now()}@medlink.demo`, phone: '7777777777', passwordHash: 'x', name: 'Pat Two' });
    const apt2 = await Appointment.create({ patientId: pat2._id, doctorId: doctorProfile._id, slotStart: new Date(), slotEnd: new Date(), status: 'completed' });
    await createRating(pat2._id.toString(), apt2._id.toString(), 2);

    const reloaded = await DoctorProfile.findById(doctorProfile._id);
    expect(reloaded!.ratingCount).toBe(2);
    expect(reloaded!.avgRating).toBe(3); // (4 + 2) / 2
  });

  it('rejects rating an appointment that is not completed', async () => {
    const { patientUser, appointment } = await seedCompletedAppointment();
    await Appointment.findByIdAndUpdate(appointment._id, { status: 'confirmed' });

    await expect(createRating(patientUser._id.toString(), appointment._id.toString(), 5)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects rating an appointment that belongs to a different patient', async () => {
    const { appointment } = await seedCompletedAppointment();
    const otherPatient = await User.create({ role: 'patient', email: `other-${Date.now()}@medlink.demo`, phone: '6666666666', passwordHash: 'x', name: 'Other' });

    await expect(createRating(otherPatient._id.toString(), appointment._id.toString(), 5)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects rating the same appointment twice', async () => {
    const { patientUser, appointment } = await seedCompletedAppointment();
    await createRating(patientUser._id.toString(), appointment._id.toString(), 5);

    await expect(createRating(patientUser._id.toString(), appointment._id.toString(), 1)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('listRatingsForDoctor', () => {
  it('lists ratings for a doctor without exposing patientId', async () => {
    const { doctorProfile, patientUser, appointment } = await seedCompletedAppointment();
    await createRating(patientUser._id.toString(), appointment._id.toString(), 5, 'Excellent');

    const result = await listRatingsForDoctor(doctorProfile._id.toString(), 1, 20);
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ score: 5, text: 'Excellent' });
    expect((result.items[0] as unknown as Record<string, unknown>).patientId).toBeUndefined();
  });
});

async function seedReportReadyBooking() {
  const labUser = await User.create({ role: 'lab', email: `lab-${Date.now()}-${Math.random()}@medlink.demo`, phone: '9999999998', passwordHash: 'x', name: 'Test Lab' });
  const labProfile = await LabProfile.create({
    userId: labUser._id, labName: 'Test Diagnostics', address: 'Addr', city: 'Noida',
    geo: { lat: 1, lng: 1 }, timings: '09:00-18:00', homeCollection: true, verificationStatus: 'approved',
    tests: [{ code: 'CBC', name: 'Complete Blood Count', price: 250, turnaroundHours: 6 }],
  });
  const patientUser = await User.create({ role: 'patient', email: `pat-lab-${Date.now()}-${Math.random()}@medlink.demo`, phone: '8888888887', passwordHash: 'x', name: 'Pat Lab Test' });
  const booking = await LabBooking.create({
    patientId: patientUser._id, labId: labProfile._id, testCodes: ['CBC'], totalPrice: 250,
    scheduledAt: new Date(Date.now() - 86400000), homeCollection: false, status: 'report_ready',
  });
  return { labProfile, patientUser, booking };
}

describe('createLabRating', () => {
  it('creates a rating for a report-ready booking and recomputes the lab avgRating/ratingCount', async () => {
    const { labProfile, patientUser, booking } = await seedReportReadyBooking();

    await createLabRating(patientUser._id.toString(), booking._id.toString(), 4, 'Fast turnaround');
    const pat2 = await User.create({ role: 'patient', email: `pat2-lab-${Date.now()}@medlink.demo`, phone: '7777777776', passwordHash: 'x', name: 'Pat Two' });
    const booking2 = await LabBooking.create({
      patientId: pat2._id, labId: labProfile._id, testCodes: ['CBC'], totalPrice: 250,
      scheduledAt: new Date(), homeCollection: false, status: 'report_ready',
    });
    await createLabRating(pat2._id.toString(), booking2._id.toString(), 2);

    const reloaded = await LabProfile.findById(labProfile._id);
    expect(reloaded!.ratingCount).toBe(2);
    expect(reloaded!.avgRating).toBe(3); // (4 + 2) / 2
  });

  it('rejects rating a booking whose report is not ready yet', async () => {
    const { patientUser, booking } = await seedReportReadyBooking();
    await LabBooking.findByIdAndUpdate(booking._id, { status: 'sample_collected' });

    await expect(createLabRating(patientUser._id.toString(), booking._id.toString(), 5)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects rating a booking that belongs to a different patient', async () => {
    const { booking } = await seedReportReadyBooking();
    const otherPatient = await User.create({ role: 'patient', email: `other-lab-${Date.now()}@medlink.demo`, phone: '6666666665', passwordHash: 'x', name: 'Other' });

    await expect(createLabRating(otherPatient._id.toString(), booking._id.toString(), 5)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects rating the same booking twice', async () => {
    const { patientUser, booking } = await seedReportReadyBooking();
    await createLabRating(patientUser._id.toString(), booking._id.toString(), 5);

    await expect(createLabRating(patientUser._id.toString(), booking._id.toString(), 1)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('listRatingsForLab', () => {
  it('lists ratings for a lab without exposing patientId', async () => {
    const { labProfile, patientUser, booking } = await seedReportReadyBooking();
    await createLabRating(patientUser._id.toString(), booking._id.toString(), 5, 'Excellent');

    const result = await listRatingsForLab(labProfile._id.toString(), 1, 20);
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ score: 5, text: 'Excellent' });
    expect((result.items[0] as unknown as Record<string, unknown>).patientId).toBeUndefined();
  });
});

async function registerAndLogin(app: Express, role: 'doctor' | 'patient' | 'lab', email: string): Promise<string[]> {
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'Test User', phone: '9999999999', role });
  const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return loginRes.headers['set-cookie'] as unknown as string[];
}

// Direct User.create with passwordHash: 'x' (as in seedCompletedAppointment above) cannot
// log in for real -- 'x' is not a valid bcrypt hash. The HTTP-level tests below need real,
// loggable-in cookies, so this variant registers the doctor and patient over
// /api/auth/register (mirroring labBookings.test.ts's seedLabAndPrescriptionHttp) and then
// builds the DoctorProfile/Appointment directly against those real user ids, since a
// 'completed' Appointment has no HTTP-creation path either.
async function seedCompletedAppointmentHttp(app: Express) {
  const doctorEmail = `doc-rating-http-${Date.now()}-${Math.random()}@medlink.demo`;
  const doctorCookies = await registerAndLogin(app, 'doctor', doctorEmail);
  const doctorUser = await User.findOne({ email: doctorEmail });
  const doctorProfile = await DoctorProfile.create({
    userId: doctorUser!._id, specialties: ['Dermatology'], qualifications: ['MBBS'], regNo: `DMC/R/${Math.floor(Math.random() * 100000)}`,
    experienceYears: 5, bio: 'bio', clinicName: 'Clinic', clinicAddress: 'Addr', city: 'Noida',
    geo: { lat: 1, lng: 1 }, consultationFee: 500, languages: ['English'], verificationStatus: 'approved',
  });

  const patientEmail = `pat-rating-http-${Date.now()}-${Math.random()}@medlink.demo`;
  const patientCookies = await registerAndLogin(app, 'patient', patientEmail);
  const patientUser = await User.findOne({ email: patientEmail });

  const appointment = await Appointment.create({
    patientId: patientUser!._id, doctorId: doctorProfile._id,
    slotStart: new Date(Date.now() - 86400000), slotEnd: new Date(Date.now() - 86400000 + 900000),
    status: 'completed',
  });

  return { doctorUser: doctorUser!, doctorCookies, doctorProfile, patientUser: patientUser!, patientCookies, appointment };
}

describe('POST /api/ratings and GET /api/ratings/doctor/:doctorId', () => {
  it('lets a patient rate their own completed appointment, then the rating is publicly listable', async () => {
    const app = createApp();
    const { doctorProfile, patientCookies, appointment } = await seedCompletedAppointmentHttp(app);

    const res = await request(app).post('/api/ratings').set('Cookie', patientCookies).send({
      appointmentId: appointment._id.toString(), score: 5, text: 'Very patient, explained everything clearly',
    });
    expect(res.status).toBe(201);

    const listRes = await request(app).get(`/api/ratings/doctor/${doctorProfile._id.toString()}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.total).toBe(1);
  });

  it('rejects a doctor trying to submit a rating', async () => {
    const app = createApp();
    const { doctorCookies, appointment } = await seedCompletedAppointmentHttp(app);

    const res = await request(app).post('/api/ratings').set('Cookie', doctorCookies).send({
      appointmentId: appointment._id.toString(), score: 5,
    });
    expect(res.status).toBe(403);
  });
});

// Same reasoning as seedCompletedAppointmentHttp above: real, loggable-in cookies need a
// real /api/auth/register user, but a 'report_ready' LabBooking has no HTTP-creation path,
// so it's built directly against that registered user's id.
async function seedReportReadyBookingHttp(app: Express) {
  const labEmail = `lab-rating-http-${Date.now()}-${Math.random()}@medlink.demo`;
  const labCookies = await registerAndLogin(app, 'lab', labEmail);
  const labUser = await User.findOne({ email: labEmail });
  const labProfile = await LabProfile.create({
    userId: labUser!._id, labName: 'Test Diagnostics', address: 'Addr', city: 'Noida',
    geo: { lat: 1, lng: 1 }, timings: '09:00-18:00', homeCollection: true, verificationStatus: 'approved',
    tests: [{ code: 'CBC', name: 'Complete Blood Count', price: 250, turnaroundHours: 6 }],
  });

  const patientEmail = `pat-lab-rating-http-${Date.now()}-${Math.random()}@medlink.demo`;
  const patientCookies = await registerAndLogin(app, 'patient', patientEmail);
  const patientUser = await User.findOne({ email: patientEmail });

  const booking = await LabBooking.create({
    patientId: patientUser!._id, labId: labProfile._id, testCodes: ['CBC'], totalPrice: 250,
    scheduledAt: new Date(Date.now() - 86400000), homeCollection: false, status: 'report_ready',
  });

  return { labUser: labUser!, labCookies, labProfile, patientUser: patientUser!, patientCookies, booking };
}

describe('POST /api/ratings/lab and GET /api/ratings/lab/:labId', () => {
  it('lets a patient rate their own report-ready booking, then the rating is publicly listable', async () => {
    const app = createApp();
    const { labProfile, patientCookies, booking } = await seedReportReadyBookingHttp(app);

    const res = await request(app).post('/api/ratings/lab').set('Cookie', patientCookies).send({
      bookingId: booking._id.toString(), score: 5, text: 'Fast turnaround, accurate report',
    });
    expect(res.status).toBe(201);

    const listRes = await request(app).get(`/api/ratings/lab/${labProfile._id.toString()}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.total).toBe(1);
  });

  it('rejects a lab trying to submit a rating', async () => {
    const app = createApp();
    const { labCookies, booking } = await seedReportReadyBookingHttp(app);

    const res = await request(app).post('/api/ratings/lab').set('Cookie', labCookies).send({
      bookingId: booking._id.toString(), score: 5,
    });
    expect(res.status).toBe(403);
  });
});
