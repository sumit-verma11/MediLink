import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../../app';
import { resetTestRedis } from '../../test-utils/resetRateLimit';
import { User } from '../../models/User';
import { DoctorProfile } from '../../models/DoctorProfile';
import { Appointment } from '../../models/Appointment';
import { TriageSession } from '../../models/TriageSession';
import { Prescription } from '../../models/Prescription';
import { AuditLog } from '../../models/AuditLog';
import { getPrescriptionSuggestions } from './prescriptions.service';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

async function registerAndLogin(app: ReturnType<typeof createApp>, role: string, email: string) {
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'A', phone: '9999999999', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return { cookies: res.headers['set-cookie'] as unknown as string[], body: res.body };
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
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function makeDoctor(specialty: string) {
  const user = await User.create({ role: 'doctor', email: `d${Date.now()}${Math.random()}@x.com`, phone: '9999999999', passwordHash: 'h', name: 'Doc' });
  const profile = await DoctorProfile.create({
    userId: user._id, specialties: [specialty], qualifications: ['MBBS'], regNo: `X/${Date.now()}`,
    experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida',
    geo: { lat: 1, lng: 1 }, consultationFee: 500, languages: ['English'],
  });
  return { user, profile };
}

async function makePatient() {
  return User.create({ role: 'patient', email: `p${Date.now()}${Math.random()}@x.com`, phone: '9999999999', passwordHash: 'h', name: 'Pat' });
}

describe('getPrescriptionSuggestions', () => {
  it('resolves via the linked triage session when one exists', async () => {
    const { user: docUser, profile: docProfile } = await makeDoctor('Cardiology'); // doctor's own specialty differs on purpose
    const patient = await makePatient();
    const triage = await TriageSession.create({
      patientId: patient._id, suggestedSpecialties: [{ name: 'Dermatology', confidence: 0.9 }],
    });
    const appt = await Appointment.create({
      patientId: patient._id, doctorId: docProfile._id, slotStart: new Date(), slotEnd: new Date(),
      status: 'confirmed', triageSessionId: triage._id,
    });

    const result = await getPrescriptionSuggestions(docUser._id.toString(), appt._id.toString());
    expect(result.source).toBe('triage');
    expect(result.specialty).toBe('Dermatology');
    expect(result.medicines.length).toBeGreaterThan(0);
    expect(result.adviceSuggestion.length).toBeGreaterThan(0);
  });

  it('falls back to the doctor\'s own specialty when the appointment has no linked triage session', async () => {
    const { user: docUser, profile: docProfile } = await makeDoctor('Cardiology');
    const patient = await makePatient();
    const appt = await Appointment.create({
      patientId: patient._id, doctorId: docProfile._id, slotStart: new Date(), slotEnd: new Date(), status: 'confirmed',
    });

    const result = await getPrescriptionSuggestions(docUser._id.toString(), appt._id.toString());
    expect(result.source).toBe('doctor-specialty');
    expect(result.specialty).toBe('Cardiology');
  });

  it('rejects a doctor who does not own the appointment with APPOINTMENT_NOT_FOUND', async () => {
    const { profile: ownerProfile } = await makeDoctor('Cardiology');
    const { user: otherDocUser } = await makeDoctor('Dermatology');
    const patient = await makePatient();
    const appt = await Appointment.create({
      patientId: patient._id, doctorId: ownerProfile._id, slotStart: new Date(), slotEnd: new Date(), status: 'confirmed',
    });

    await expect(getPrescriptionSuggestions(otherDocUser._id.toString(), appt._id.toString()))
      .rejects.toMatchObject({ statusCode: 404, code: 'APPOINTMENT_NOT_FOUND' });
  });

  it('rejects an appointment that is not confirmed with INVALID_APPOINTMENT_STATUS', async () => {
    const { user: docUser, profile: docProfile } = await makeDoctor('Cardiology');
    const patient = await makePatient();
    const appt = await Appointment.create({
      patientId: patient._id, doctorId: docProfile._id, slotStart: new Date(), slotEnd: new Date(), status: 'requested',
    });

    await expect(getPrescriptionSuggestions(docUser._id.toString(), appt._id.toString()))
      .rejects.toMatchObject({ statusCode: 409, code: 'INVALID_APPOINTMENT_STATUS' });
  });

  it('writes exactly one prescription.ai_suggestion_viewed AuditLog row per call', async () => {
    const { user: docUser, profile: docProfile } = await makeDoctor('Cardiology');
    const patient = await makePatient();
    const appt = await Appointment.create({
      patientId: patient._id, doctorId: docProfile._id, slotStart: new Date(), slotEnd: new Date(), status: 'confirmed',
    });

    await getPrescriptionSuggestions(docUser._id.toString(), appt._id.toString());
    const logs = await AuditLog.find({ action: 'prescription.ai_suggestion_viewed' });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.entityType).toBe('Appointment');
  });

  // The non-negotiable safety property (CLAUDE.md §0.1): calling this
  // service function -- including repeatedly -- must never create a
  // Prescription document. See design spec Design Decision 5.
  it('never writes to the Prescription collection, even when called repeatedly', async () => {
    const { user: docUser, profile: docProfile } = await makeDoctor('Cardiology');
    const patient = await makePatient();
    const triage = await TriageSession.create({
      patientId: patient._id, suggestedSpecialties: [{ name: 'Dermatology', confidence: 0.9 }],
    });
    const appt = await Appointment.create({
      patientId: patient._id, doctorId: docProfile._id, slotStart: new Date(), slotEnd: new Date(),
      status: 'confirmed', triageSessionId: triage._id,
    });

    await getPrescriptionSuggestions(docUser._id.toString(), appt._id.toString());
    await getPrescriptionSuggestions(docUser._id.toString(), appt._id.toString());
    await getPrescriptionSuggestions(docUser._id.toString(), appt._id.toString());

    expect(await Prescription.countDocuments({})).toBe(0);
  });
});

describe('GET /api/prescriptions/suggest/:appointmentId', () => {
  it('401s with no session', async () => {
    const app = createApp();
    const res = await request(app).get(`/api/prescriptions/suggest/${new mongoose.Types.ObjectId()}`);
    expect(res.status).toBe(401);
  });

  it('403s for a patient (doctor-only route)', async () => {
    const app = createApp();
    const { cookies } = await registerAndLogin(app, 'patient', `pat-suggest-${Date.now()}@medlink.demo`);
    const res = await request(app).get(`/api/prescriptions/suggest/${new mongoose.Types.ObjectId()}`).set('Cookie', cookies);
    expect(res.status).toBe(403);
  });

  it('200s with the suggestion shape for a doctor on their own confirmed appointment', async () => {
    const app = createApp();
    const { cookies, body } = await registerAndLogin(app, 'doctor', `doc-suggest-${Date.now()}@medlink.demo`);
    await DoctorProfile.create({
      userId: body.user.id, specialties: ['Cardiology'], qualifications: ['MBBS'], regNo: `X/S1-${Date.now()}`,
      experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida',
      geo: { lat: 1, lng: 1 }, consultationFee: 500, languages: ['English'],
    });
    const docProfile = await DoctorProfile.findOne({ userId: body.user.id });
    const patient = await makePatient();
    const appt = await Appointment.create({
      patientId: patient._id, doctorId: docProfile!._id, slotStart: new Date(), slotEnd: new Date(), status: 'confirmed',
    });

    const res = await request(app).get(`/api/prescriptions/suggest/${appt._id}`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('source');
    expect(res.body).toHaveProperty('medicines');
    expect(res.body).toHaveProperty('disclaimer');
  });

  // The non-negotiable safety property, re-verified at the full HTTP layer
  // (not just the service unit test in Task 2): repeated calls through the
  // real route/controller/service stack must never create a Prescription.
  it('never creates a Prescription document, even across repeated HTTP calls', async () => {
    const app = createApp();
    const { cookies, body } = await registerAndLogin(app, 'doctor', `doc-suggest2-${Date.now()}@medlink.demo`);
    await DoctorProfile.create({
      userId: body.user.id, specialties: ['Cardiology'], qualifications: ['MBBS'], regNo: `X/S2-${Date.now()}`,
      experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida',
      geo: { lat: 1, lng: 1 }, consultationFee: 500, languages: ['English'],
    });
    const docProfile = await DoctorProfile.findOne({ userId: body.user.id });
    const patient = await makePatient();
    const appt = await Appointment.create({
      patientId: patient._id, doctorId: docProfile!._id, slotStart: new Date(), slotEnd: new Date(), status: 'confirmed',
    });

    await request(app).get(`/api/prescriptions/suggest/${appt._id}`).set('Cookie', cookies);
    await request(app).get(`/api/prescriptions/suggest/${appt._id}`).set('Cookie', cookies);
    await request(app).get(`/api/prescriptions/suggest/${appt._id}`).set('Cookie', cookies);

    expect(await Prescription.countDocuments({})).toBe(0);
  });
});
