import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { createBooking, updateBookingStatus, getReportPath, listBookingsForLab } from './labBookings.service';
import { createReferral, getReferralByToken } from '../labReferrals/labReferrals.service';
import { User } from '../../models/User';
import { DoctorProfile } from '../../models/DoctorProfile';
import { LabProfile } from '../../models/LabProfile';
import { Prescription } from '../../models/Prescription';
import { LabReferral } from '../../models/LabReferral';
import { LabBooking } from '../../models/LabBooking';
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

async function seedLabAndPrescription() {
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
  return { doctorUser, patientUser, labUser, labProfile, prescription };
}

describe('createBooking', () => {
  it('creates a walk-in booking with a computed total price', async () => {
    const { patientUser, labProfile } = await seedLabAndPrescription();

    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      labId: labProfile._id.toString(), testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: false,
    });

    expect(booking.totalPrice).toBe(250);
    expect(booking.status).toBe('booked');
    expect(booking.referralId).toBeUndefined();
  });

  it('creates a referral-linked booking and transitions the referral to booked', async () => {
    const { doctorUser, patientUser, labProfile, prescription } = await seedLabAndPrescription();
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    await getReferralByToken(referral.token); // simulate the patient opening the link first

    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      labId: labProfile._id.toString(), testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: true,
    }, referral.token);

    expect(booking.referralId!.toString()).toBe(referral._id.toString());

    const reloadedReferral = await LabReferral.findById(referral._id);
    expect(reloadedReferral!.status).toBe('booked');
  });

  it('rejects home collection when the lab does not offer it', async () => {
    const { patientUser, labProfile } = await seedLabAndPrescription();
    labProfile.homeCollection = false;
    await labProfile.save();

    await expect(
      createBooking(patientUser._id.toString(), labProfile._id.toString(), {
        labId: labProfile._id.toString(), testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: true,
      })
    ).rejects.toThrow();
  });
});

describe('updateBookingStatus', () => {
  it('transitions a booking through the pipeline and notifies patient + doctor on report_ready', async () => {
    const { doctorUser, patientUser, labUser, labProfile, prescription } = await seedLabAndPrescription();
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      labId: labProfile._id.toString(), testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: false,
    }, referral.token);

    await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'sample_collected');
    const afterCollection = await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'report_ready', '/uploads/lab-reports/fake.pdf');

    expect(afterCollection.status).toBe('report_ready');
    expect(afterCollection.reportUrl).toBe('/uploads/lab-reports/fake.pdf');

    const reloadedReferral = await LabReferral.findById(referral._id);
    expect(reloadedReferral!.status).toBe('report_ready');
    expect(reloadedReferral!.reportUrl).toBe('/uploads/lab-reports/fake.pdf');

    const patientNotifications = await Notification.find({ userId: patientUser._id, type: 'lab_report_ready' });
    const doctorNotifications = await Notification.find({ userId: doctorUser._id, type: 'lab_report_ready' });
    expect(patientNotifications).toHaveLength(1);
    expect(doctorNotifications).toHaveLength(1);
  });

  it('notifies the patient on report_ready even for a walk-in booking with no referral', async () => {
    const { patientUser, labUser, labProfile } = await seedLabAndPrescription();
    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      labId: labProfile._id.toString(), testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: false,
    });
    expect(booking.referralId).toBeUndefined();

    await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'sample_collected');
    await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'report_ready', '/uploads/lab-reports/walkin.pdf');

    const patientNotifications = await Notification.find({ userId: patientUser._id, type: 'lab_report_ready' });
    expect(patientNotifications).toHaveLength(1);
  });

  it('rejects a lab updating a booking that is not its own', async () => {
    const { patientUser, labProfile } = await seedLabAndPrescription();
    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      labId: labProfile._id.toString(), testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: false,
    });
    const otherLabUser = await User.create({ role: 'lab', email: `otherlab-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Other Lab' });

    await expect(updateBookingStatus(otherLabUser._id.toString(), booking._id.toString(), 'sample_collected')).rejects.toThrow();
  });
});

describe('getReportPath', () => {
  it('allows the owning patient and the lab that issued the report to fetch the path', async () => {
    const { doctorUser, patientUser, labUser, labProfile, prescription } = await seedLabAndPrescription();
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      labId: labProfile._id.toString(), testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: false,
    }, referral.token);
    await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'sample_collected');
    await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'report_ready', '/uploads/lab-reports/fake.pdf');

    const asPatient = await getReportPath(booking._id.toString(), patientUser._id.toString(), 'patient');
    expect(asPatient).toContain('lab-reports');

    const asLab = await getReportPath(booking._id.toString(), labUser._id.toString(), 'lab');
    expect(asLab).toContain('lab-reports');
  });

  it('rejects a different patient fetching someone else\'s report', async () => {
    const { doctorUser, patientUser, labUser, labProfile, prescription } = await seedLabAndPrescription();
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    const booking = await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      labId: labProfile._id.toString(), testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: false,
    }, referral.token);
    await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'sample_collected');
    await updateBookingStatus(labUser._id.toString(), booking._id.toString(), 'report_ready', '/uploads/lab-reports/fake.pdf');
    const otherPatient = await User.create({ role: 'patient', email: `other-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Other' });

    await expect(getReportPath(booking._id.toString(), otherPatient._id.toString(), 'patient')).rejects.toThrow();
  });
});

describe('listBookingsForLab', () => {
  it('returns only the requesting lab\'s own bookings, paginated', async () => {
    const { patientUser, labUser, labProfile } = await seedLabAndPrescription();
    await createBooking(patientUser._id.toString(), labProfile._id.toString(), {
      labId: labProfile._id.toString(), testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000), homeCollection: false,
    });

    const result = await listBookingsForLab(labUser._id.toString(), 1, 20);
    expect(result.total).toBe(1);
    expect(result.items[0]!.testCodes).toEqual(['CBC']);
  });
});

async function registerAndLogin(app: Express, role: 'doctor' | 'patient' | 'lab', email: string): Promise<string[]> {
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'Test User', phone: '9999999999', role });
  const loginRes = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return loginRes.headers['set-cookie'] as unknown as string[];
}

async function seedLabAndPrescriptionHttp(app: Express) {
  const patientEmail = `pat-http-${Date.now()}-${Math.random()}@medlink.demo`;
  const patientCookies = await registerAndLogin(app, 'patient', patientEmail);
  const patientUser = await User.findOne({ email: patientEmail });

  const labEmail = `lab-http-${Date.now()}-${Math.random()}@medlink.demo`;
  const labCookies = await registerAndLogin(app, 'lab', labEmail);
  const labUser = await User.findOne({ email: labEmail });
  const labProfile = await LabProfile.create({
    userId: labUser!._id, labName: 'HealthFirst Diagnostics', address: 'A', city: 'Noida',
    geo: { lat: 1, lng: 1 }, timings: '07:00-21:00', homeCollection: true, verificationStatus: 'approved',
    tests: [{ code: 'CBC', name: 'Complete Blood Count', price: 250, turnaroundHours: 6 }],
  });

  const doctorUser = await User.create({ role: 'doctor', email: `doc-http-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Dr Test' });
  const doctorProfile = await DoctorProfile.create({
    userId: doctorUser._id, specialties: ['General Physician'], qualifications: ['MBBS'], regNo: `DMC/R/${Math.floor(Math.random() * 100000)}`,
    experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 },
    consultationFee: 500, languages: ['English'], verificationStatus: 'approved', avgRating: 4.5,
  });
  const prescription = await Prescription.create({
    appointmentId: new mongoose.Types.ObjectId(), doctorId: doctorProfile._id, patientId: patientUser!._id,
    diagnosisNote: 'x', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
    recommendedTests: [{ testName: 'Complete Blood Count' }],
  });

  return { patientCookies, patientUser: patientUser!, labCookies, labUser: labUser!, labProfile, doctorUser, prescription };
}

describe('POST /api/lab-bookings', () => {
  it('rejects an unauthenticated request', async () => {
    const app = createApp();
    const res = await request(app).post('/api/lab-bookings').send({ labId: 'x', testCodes: ['CBC'], scheduledAt: new Date().toISOString(), homeCollection: false });
    expect(res.status).toBe(401);
  });

  it('lets a patient create a walk-in booking with a computed total price', async () => {
    const app = createApp();
    const { patientCookies, labProfile } = await seedLabAndPrescriptionHttp(app);

    const res = await request(app).post('/api/lab-bookings').set('Cookie', patientCookies).send({
      labId: labProfile._id.toString(),
      testCodes: ['CBC'],
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      homeCollection: false,
    });

    expect(res.status).toBe(201);
    expect(res.body.booking.totalPrice).toBe(250);
    expect(res.body.booking.status).toBe('booked');
  });

  it('lets a patient book against a referral via ?referralToken=', async () => {
    const app = createApp();
    const { patientCookies, patientUser, labProfile, doctorUser, prescription } = await seedLabAndPrescriptionHttp(app);
    const referral = await createReferral(doctorUser._id.toString(), prescription._id.toString(), labProfile._id.toString(), ['CBC']);
    await getReferralByToken(referral.token);
    expect(referral.patientId.toString()).toBe(patientUser._id.toString());

    const res = await request(app)
      .post(`/api/lab-bookings?referralToken=${referral.token}`)
      .set('Cookie', patientCookies)
      .send({ labId: labProfile._id.toString(), testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000).toISOString(), homeCollection: false });

    expect(res.status).toBe(201);
    expect(res.body.booking.referralId).toBeTruthy();
  });

  it('rejects a lab trying to create a booking', async () => {
    const app = createApp();
    const { labCookies, labProfile } = await seedLabAndPrescriptionHttp(app);

    const res = await request(app).post('/api/lab-bookings').set('Cookie', labCookies).send({
      labId: labProfile._id.toString(), testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000).toISOString(), homeCollection: false,
    });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/lab-bookings/me', () => {
  it('returns the requesting lab\'s own bookings, paginated', async () => {
    const app = createApp();
    const { patientCookies, labCookies, labProfile } = await seedLabAndPrescriptionHttp(app);
    await request(app).post('/api/lab-bookings').set('Cookie', patientCookies).send({
      labId: labProfile._id.toString(), testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000).toISOString(), homeCollection: false,
    });

    const res = await request(app).get('/api/lab-bookings/me').set('Cookie', labCookies);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].testCodes).toEqual(['CBC']);
  });
});

describe('PATCH /api/lab-bookings/:id/status', () => {
  it('lets the owning lab transition a booking to sample_collected', async () => {
    const app = createApp();
    const { patientCookies, labCookies, labProfile } = await seedLabAndPrescriptionHttp(app);
    const createRes = await request(app).post('/api/lab-bookings').set('Cookie', patientCookies).send({
      labId: labProfile._id.toString(), testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000).toISOString(), homeCollection: false,
    });
    const bookingId = createRes.body.booking._id;

    const res = await request(app).patch(`/api/lab-bookings/${bookingId}/status`).set('Cookie', labCookies).send({ status: 'sample_collected' });

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('sample_collected');
  });

  it('rejects an invalid status value', async () => {
    const app = createApp();
    const { patientCookies, labCookies, labProfile } = await seedLabAndPrescriptionHttp(app);
    const createRes = await request(app).post('/api/lab-bookings').set('Cookie', patientCookies).send({
      labId: labProfile._id.toString(), testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000).toISOString(), homeCollection: false,
    });
    const bookingId = createRes.body.booking._id;

    const res = await request(app).patch(`/api/lab-bookings/${bookingId}/status`).set('Cookie', labCookies).send({ status: 'booked' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/lab-bookings/:id/report and GET /api/lab-bookings/:id/report', () => {
  it('lets the owning lab upload a report, then the owning patient and lab download it', async () => {
    const app = createApp();
    const { patientCookies, labCookies, labProfile } = await seedLabAndPrescriptionHttp(app);
    const createRes = await request(app).post('/api/lab-bookings').set('Cookie', patientCookies).send({
      labId: labProfile._id.toString(), testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000).toISOString(), homeCollection: false,
    });
    const bookingId = createRes.body.booking._id;
    await request(app).patch(`/api/lab-bookings/${bookingId}/status`).set('Cookie', labCookies).send({ status: 'sample_collected' });

    const uploadRes = await request(app)
      .post(`/api/lab-bookings/${bookingId}/report`)
      .set('Cookie', labCookies)
      .attach('report', Buffer.from('%PDF-1.4 fake report content'), { filename: 'report.pdf', contentType: 'application/pdf' });

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.booking.status).toBe('report_ready');
    expect(uploadRes.body.booking.reportUrl).toBe(`/uploads/lab-reports/${bookingId}.pdf`);

    const patientDownload = await request(app).get(`/api/lab-bookings/${bookingId}/report`).set('Cookie', patientCookies);
    expect(patientDownload.status).toBe(200);

    const labDownload = await request(app).get(`/api/lab-bookings/${bookingId}/report`).set('Cookie', labCookies);
    expect(labDownload.status).toBe(200);
  });

  it('rejects the upload when no file is attached', async () => {
    const app = createApp();
    const { patientCookies, labCookies, labProfile } = await seedLabAndPrescriptionHttp(app);
    const createRes = await request(app).post('/api/lab-bookings').set('Cookie', patientCookies).send({
      labId: labProfile._id.toString(), testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000).toISOString(), homeCollection: false,
    });
    const bookingId = createRes.body.booking._id;

    const res = await request(app).post(`/api/lab-bookings/${bookingId}/report`).set('Cookie', labCookies);

    expect(res.status).toBe(400);
  });

  it('rejects a different patient downloading someone else\'s report', async () => {
    const app = createApp();
    const { patientCookies, labCookies, labProfile } = await seedLabAndPrescriptionHttp(app);
    const createRes = await request(app).post('/api/lab-bookings').set('Cookie', patientCookies).send({
      labId: labProfile._id.toString(), testCodes: ['CBC'], scheduledAt: new Date(Date.now() + 86400000).toISOString(), homeCollection: false,
    });
    const bookingId = createRes.body.booking._id;
    await request(app)
      .post(`/api/lab-bookings/${bookingId}/report`)
      .set('Cookie', labCookies)
      .attach('report', Buffer.from('%PDF-1.4 fake report content'), { filename: 'report.pdf', contentType: 'application/pdf' });

    const otherPatientCookies = await registerAndLogin(app, 'patient', `other-pat-http-${Date.now()}@medlink.demo`);
    const res = await request(app).get(`/api/lab-bookings/${bookingId}/report`).set('Cookie', otherPatientCookies);

    expect(res.status).toBe(404);
  });
});
