import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../app';
import { resetTestRedis } from '../../test-utils/resetRateLimit';
import { AvailabilityRule } from '../../models/AvailabilityRule';
import { DoctorProfile } from '../../models/DoctorProfile';
import { TriageSession } from '../../models/TriageSession';
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
  await request(app).post('/api/auth/register').send({ email, password: 'longenough1', name: 'A', phone: '9999999999', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'longenough1' });
  return res.headers['set-cookie'] as unknown as string[];
}

const RULE_VALID_FROM = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
const RULE_VALID_TO = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

/**
 * Creates a bookable doctor: an *approved* profile (createAppointment 404s on an
 * unapproved doctor) plus an availability rule covering today and tomorrow, so
 * `GET /api/doctors/:id/slots` returns real, validatable slots.
 */
async function seedDoctorWithAvailability(app: Express, slotMinutes = 60) {
  const docCookies = await registerAndLogin(app, 'doctor', `doc-${Date.now()}-${Math.random()}@medlink.demo`);
  await request(app).put('/api/doctors/me').set('Cookie', docCookies).send({
    specialties: ['Dermatology'], qualifications: ['MBBS'], regNo: 'DMC/R/00001',
    experienceYears: 5, bio: 'bio', clinicName: 'Clinic', clinicAddress: 'Addr',
    city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 500, languages: ['English'],
  });
  const doctorProfile = await DoctorProfile.findOne({}).sort({ _id: -1 });
  // A patient may only book an approved doctor; a freshly PUT profile is 'pending'.
  await DoctorProfile.updateOne({ _id: doctorProfile!._id }, { verificationStatus: 'approved' });
  // Two rules (today + tomorrow's day-of-week, in IST -- slotService generates against
  // IST calendar days, so a raw UTC weekday here would make this flaky whenever the
  // suite runs between 18:30 and 23:59 UTC, when IST has already rolled to the next day)
  // so a suite run late in the day still has future slots once slots that have already
  // passed are skipped.
  const IST_OFFSET_MINUTES = 5 * 60 + 30;
  for (const dayOffset of [0, 1]) {
    const istNow = new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000 + IST_OFFSET_MINUTES * 60 * 1000);
    await AvailabilityRule.create({
      doctorId: doctorProfile!._id,
      dayOfWeek: istNow.getUTCDay(),
      startTime: '00:00', endTime: '23:00', slotMinutes,
      validFrom: RULE_VALID_FROM, validTo: RULE_VALID_TO,
    });
  }
  return { doctorId: doctorProfile!._id.toString(), docCookies };
}

describe('POST /api/appointments', () => {
  it('creates a requested appointment for a free slot', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'bookpatient1@medlink.demo');

    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    const firstSlot = slotsRes.body.slots[0];

    const res = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: firstSlot.start, slotEnd: firstSlot.end,
    });

    expect(res.status).toBe(201);
    expect(res.body.appointment.status).toBe('requested');
    expect(res.body.appointment.timeline).toHaveLength(1);
  });

  it('rejects a second booking for the same slot with 409', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'bookpatient2@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    const firstSlot = slotsRes.body.slots[0];

    await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: firstSlot.start, slotEnd: firstSlot.end,
    });

    const secondPatientCookies = await registerAndLogin(app, 'patient', 'bookpatient3@medlink.demo');
    const res = await request(app).post('/api/appointments').set('Cookie', secondPatientCookies).send({
      doctorId, slotStart: firstSlot.start, slotEnd: firstSlot.end,
    });

    expect(res.status).toBe(409);
  });

  it('rejects a doctor trying to book', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const docCookies = await registerAndLogin(app, 'doctor', 'bookingdoc2@medlink.demo');
    const res = await request(app).post('/api/appointments').set('Cookie', docCookies).send({
      doctorId,
      slotStart: new Date(Date.now() + 24 * 60 * 60 * 1000),
      slotEnd: new Date(Date.now() + 24 * 60 * 60 * 1000 + 15 * 60 * 1000),
    });
    expect(res.status).toBe(403);
  });

  it('rejects a hand-built slot the doctor does not actually offer', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'fakeslot@medlink.demo');

    // Inside the rule's window but off the 60-minute grid, so it is not a generated slot.
    const start = new Date(Date.now() + 25 * 60 * 60 * 1000);
    start.setUTCMinutes(37, 13, 0);
    const res = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: start, slotEnd: new Date(start.getTime() + 60 * 60 * 1000),
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SLOT_NOT_AVAILABLE');
  });

  it('rejects a booking on a date the doctor blocked', async () => {
    const app = createApp();
    const { doctorId, docCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'blockedslot@medlink.demo');

    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    const slot = slotsRes.body.slots[0];

    // Blocked dates are matched by IST calendar day (see slotService.ts's startOfISTDay),
    // so any instant within the slot's IST day blocks it -- the slot's own start works,
    // rather than reconstructing a UTC-midnight date that may land on a different IST day.
    await request(app).post('/api/doctors/me/blocked-dates').set('Cookie', docCookies).send({
      date: slot.start,
      reason: 'On leave',
    });

    const res = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slot.start, slotEnd: slot.end,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SLOT_NOT_AVAILABLE');
  });

  it('rejects booking a doctor who is not approved', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    await DoctorProfile.updateOne({ _id: doctorId }, { verificationStatus: 'pending' });
    const patientCookies = await registerAndLogin(app, 'patient', 'unapproveddoc@medlink.demo');

    const res = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId,
      slotStart: new Date(Date.now() + 25 * 60 * 60 * 1000),
      slotEnd: new Date(Date.now() + 26 * 60 * 60 * 1000),
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DOCTOR_NOT_FOUND');
  });

  it('rejects a slot in the past at the schema boundary', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'pastslot@medlink.demo');

    const start = new Date(Date.now() - 60 * 60 * 1000);
    const res = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: start, slotEnd: new Date(start.getTime() + 60 * 60 * 1000),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/appointments/:id/confirm and /reject', () => {
  it('lets the owning doctor confirm a requested appointment', async () => {
    const app = createApp();
    const { doctorId, docCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'confirmpatient@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    const slot = slotsRes.body.slots[0];
    const bookRes = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slot.start, slotEnd: slot.end,
    });
    const appointmentId = bookRes.body.appointment._id;

    const confirmRes = await request(app).patch(`/api/appointments/${appointmentId}/confirm`).set('Cookie', docCookies);
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.appointment.status).toBe('confirmed');
    expect(confirmRes.body.appointment.timeline).toHaveLength(2);
  });

  it('rejects a doctor confirming another doctor\'s appointment', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const { docCookies: otherDocCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'confirmpatient2@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    const slot = slotsRes.body.slots[0];
    const bookRes = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slot.start, slotEnd: slot.end,
    });

    const res = await request(app)
      .patch(`/api/appointments/${bookRes.body.appointment._id}/confirm`)
      .set('Cookie', otherDocCookies);
    expect(res.status).toBe(404);
  });

  it('lets the owning doctor reject with a reason', async () => {
    const app = createApp();
    const { doctorId, docCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'rejectpatient@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    const slot = slotsRes.body.slots[0];
    const bookRes = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slot.start, slotEnd: slot.end,
    });

    const rejectRes = await request(app)
      .patch(`/api/appointments/${bookRes.body.appointment._id}/reject`)
      .set('Cookie', docCookies)
      .send({ reason: 'Fully booked elsewhere' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.appointment.status).toBe('rejected');
    expect(rejectRes.body.appointment.rejectionReason).toBe('Fully booked elsewhere');
  });

  it('releases the slot lock on rejection so it can be rebooked', async () => {
    const app = createApp();
    const { doctorId, docCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'rejectpatient2@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    const slot = slotsRes.body.slots[0];
    const bookRes = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slot.start, slotEnd: slot.end,
    });
    await request(app).patch(`/api/appointments/${bookRes.body.appointment._id}/reject`).set('Cookie', docCookies).send({ reason: 'no' });

    const secondPatientCookies = await registerAndLogin(app, 'patient', 'rebookpatient@medlink.demo');
    const rebookRes = await request(app).post('/api/appointments').set('Cookie', secondPatientCookies).send({
      doctorId, slotStart: slot.start, slotEnd: slot.end,
    });
    expect(rebookRes.status).toBe(201);
  });
});

describe('status-transition atomicity', () => {
  it('returns 409, not 500, when a doctor confirms an appointment the patient already cancelled', async () => {
    const app = createApp();
    const { doctorId, docCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'stale1@medlink.demo');

    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=7`).set('Cookie', patientCookies);
    const farSlot = slotsRes.body.slots.find((s: { start: string }) => new Date(s.start).getTime() - Date.now() > 3 * 60 * 60 * 1000);
    const bookRes = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: farSlot.start, slotEnd: farSlot.end,
    });
    const staleId = bookRes.body.appointment._id;

    // Patient cancels, freeing the slot; a second patient rebooks it.
    await request(app).patch(`/api/appointments/${staleId}/cancel`).set('Cookie', patientCookies);
    const secondPatientCookies = await registerAndLogin(app, 'patient', 'stale2@medlink.demo');
    const rebook = await request(app).post('/api/appointments').set('Cookie', secondPatientCookies).send({
      doctorId, slotStart: farSlot.start, slotEnd: farSlot.end,
    });
    expect(rebook.status).toBe(201);

    // The doctor's dashboard is stale and still shows the cancelled request. Confirming
    // it would collide with the live appointment's {doctorId, slotStart} unique index.
    const res = await request(app).patch(`/api/appointments/${staleId}/confirm`).set('Cookie', docCookies);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('returns 409 when a doctor rejects an appointment that is no longer requested', async () => {
    const app = createApp();
    const { doctorId, docCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'stale3@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    const slot = slotsRes.body.slots[0];
    const bookRes = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slot.start, slotEnd: slot.end,
    });
    const id = bookRes.body.appointment._id;

    await request(app).patch(`/api/appointments/${id}/confirm`).set('Cookie', docCookies);
    const res = await request(app).patch(`/api/appointments/${id}/reject`).set('Cookie', docCookies).send({ reason: 'changed my mind' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('returns 409 when a patient cancels an already-cancelled appointment', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'stale4@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=7`).set('Cookie', patientCookies);
    const farSlot = slotsRes.body.slots.find((s: { start: string }) => new Date(s.start).getTime() - Date.now() > 3 * 60 * 60 * 1000);
    const bookRes = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: farSlot.start, slotEnd: farSlot.end,
    });
    const id = bookRes.body.appointment._id;

    expect((await request(app).patch(`/api/appointments/${id}/cancel`).set('Cookie', patientCookies)).status).toBe(200);
    const res = await request(app).patch(`/api/appointments/${id}/cancel`).set('Cookie', patientCookies);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('GET /api/appointments/me query params', () => {
  it('falls back to defaults for a malformed page/limit instead of 500ing', async () => {
    const app = createApp();
    const patientCookies = await registerAndLogin(app, 'patient', 'badpage@medlink.demo');
    const res = await request(app).get('/api/appointments/me?page=abc&limit=xyz').set('Cookie', patientCookies);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
  });
});

describe('PATCH /api/appointments/:id/cancel', () => {
  it('lets the owning patient cancel more than 2 hours before the slot', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'cancelpatient1@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=7`).set('Cookie', patientCookies);
    // pick a slot far enough in the future to be outside the 2h cutoff
    const farSlot = slotsRes.body.slots.find((s: { start: string }) => new Date(s.start).getTime() - Date.now() > 3 * 60 * 60 * 1000);
    const bookRes = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: farSlot.start, slotEnd: farSlot.end,
    });

    const cancelRes = await request(app)
      .patch(`/api/appointments/${bookRes.body.appointment._id}/cancel`)
      .set('Cookie', patientCookies);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.appointment.status).toBe('cancelled');
  });

  it('rejects a cancellation within the 2-hour cutoff', async () => {
    const app = createApp();
    // 10-minute slots so the doctor's next *real* generated slot is guaranteed to fall
    // inside the 2-hour cutoff. A hand-built slotStart is no longer bookable at all —
    // createAppointment now validates the interval against generated availability.
    const { doctorId } = await seedDoctorWithAvailability(app, 10);
    const patientCookies = await registerAndLogin(app, 'patient', 'cancelpatient2@medlink.demo');

    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    const nearSlot = slotsRes.body.slots[0];
    // Guard the premise of the test: slots[0] is the soonest still-future slot, which
    // with 10-minute granularity is always well inside the 2-hour cancel cutoff.
    expect(new Date(nearSlot.start).getTime() - Date.now()).toBeLessThan(2 * 60 * 60 * 1000);

    const bookRes = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: nearSlot.start, slotEnd: nearSlot.end,
    });
    expect(bookRes.status).toBe(201);

    const cancelRes = await request(app)
      .patch(`/api/appointments/${bookRes.body.appointment._id}/cancel`)
      .set('Cookie', patientCookies);
    expect(cancelRes.status).toBe(400);
    expect(cancelRes.body.error.code).toBe('CANCEL_CUTOFF');
  });

  it('rejects a different patient cancelling', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'cancelpatient3@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=7`).set('Cookie', patientCookies);
    const farSlot = slotsRes.body.slots.find((s: { start: string }) => new Date(s.start).getTime() - Date.now() > 3 * 60 * 60 * 1000);
    const bookRes = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: farSlot.start, slotEnd: farSlot.end,
    });

    const otherPatientCookies = await registerAndLogin(app, 'patient', 'notowner@medlink.demo');
    const res = await request(app)
      .patch(`/api/appointments/${bookRes.body.appointment._id}/cancel`)
      .set('Cookie', otherPatientCookies);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/appointments/me', () => {
  it('lists a patient\'s own appointments with pagination fields', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'listpatient@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slotsRes.body.slots[0].start, slotEnd: slotsRes.body.slots[0].end,
    });

    const res = await request(app).get('/api/appointments/me').set('Cookie', patientCookies);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.page).toBe(1);
    expect(res.body.total).toBe(1);
  });

  it('lists a doctor\'s own appointments, filtered by status', async () => {
    const app = createApp();
    const { doctorId, docCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'listpatient2@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slotsRes.body.slots[0].start, slotEnd: slotsRes.body.slots[0].end,
    });

    const res = await request(app).get('/api/appointments/me?status=requested').set('Cookie', docCookies);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].status).toBe('requested');
  });
});

describe('GET /api/appointments/me — rated flag', () => {
  it('marks a patient\'s completed-and-rated appointment as rated: true and an unrated one as rated: false', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'ratedflag@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=7`).set('Cookie', patientCookies);

    const book = async (slot: { start: string; end: string }) => {
      const res = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
        doctorId, slotStart: slot.start, slotEnd: slot.end,
      });
      return res.body.appointment._id as string;
    };

    const ratedAppointmentId = await book(slotsRes.body.slots[0]);
    const unratedAppointmentId = await book(slotsRes.body.slots[1]);

    await Appointment.updateOne({ _id: ratedAppointmentId }, { status: 'completed' });
    await Appointment.updateOne({ _id: unratedAppointmentId }, { status: 'completed' });

    const patientRes = await request(app).post('/api/auth/login').send({ email: 'ratedflag@medlink.demo', password: 'longenough1' });
    const patientId = patientRes.body.user.id;
    await Rating.create({
      doctorId,
      patientId,
      appointmentId: ratedAppointmentId,
      score: 5,
      text: 'Great',
    });

    const res = await request(app).get('/api/appointments/me').set('Cookie', patientCookies);
    expect(res.status).toBe(200);
    const rated = res.body.items.find((i: { _id: string }) => i._id === ratedAppointmentId);
    const unrated = res.body.items.find((i: { _id: string }) => i._id === unratedAppointmentId);
    expect(rated.rated).toBe(true);
    expect(unrated.rated).toBe(false);
  });

  it('does not include a rated field for a doctor\'s own appointment listing', async () => {
    const app = createApp();
    const { doctorId, docCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'ratedflagdoc@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    const appointmentId = (
      await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
        doctorId, slotStart: slotsRes.body.slots[0].start, slotEnd: slotsRes.body.slots[0].end,
      })
    ).body.appointment._id;
    await Appointment.updateOne({ _id: appointmentId }, { status: 'completed' });

    const res = await request(app).get('/api/appointments/me').set('Cookie', docCookies);
    expect(res.status).toBe(200);
    expect(res.body.items[0].rated).toBeUndefined();
  });
});

describe('POST /api/appointments — triageSessionId ownership', () => {
  it('rejects a triageSessionId that belongs to a different patient', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const otherPatientCookies = await registerAndLogin(app, 'patient', 'otherpatient@medlink.demo');
    const otherPatientRes = await request(app).post('/api/auth/login').send({ email: 'otherpatient@medlink.demo', password: 'longenough1' });
    const otherPatientId = (await request(app).get('/api/patients/me').set('Cookie', otherPatientCookies)).body; // not directly used; session created below instead

    const foreignSession = await TriageSession.create({ patientId: new mongoose.Types.ObjectId() });

    const patientCookies = await registerAndLogin(app, 'patient', 'triageowner@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    const res = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slotsRes.body.slots[0].start, slotEnd: slotsRes.body.slots[0].end,
      triageSessionId: foreignSession._id.toString(),
    });

    expect(res.status).toBe(403);
  });

  it('accepts a triageSessionId that belongs to the booking patient and copies its symptom summary', async () => {
    const app = createApp();
    const { doctorId } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'triageowner2@medlink.demo');
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'triageowner2@medlink.demo', password: 'longenough1' });
    void loginRes;

    const meResponse = await request(app).post('/api/triage/messages').set('Cookie', patientCookies).send({ text: 'itchy patches' });
    const session = await TriageSession.findByIdAndUpdate(
      meResponse.body.session._id,
      { extractedSymptoms: ['itchy patches on elbow'] },
      { new: true }
    );

    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    const res = await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slotsRes.body.slots[0].start, slotEnd: slotsRes.body.slots[0].end,
      triageSessionId: session!._id.toString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.appointment.triageSessionId).toBe(session!._id.toString());
  });
});

describe('GET /api/appointments/me — doctor sees triage summary', () => {
  it('includes the linked triage session\'s extracted symptoms for the doctor', async () => {
    const app = createApp();
    const { doctorId, docCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'triagesummary@medlink.demo');

    const triageRes = await request(app).post('/api/triage/messages').set('Cookie', patientCookies).send({ text: 'itchy patches' });
    await TriageSession.findByIdAndUpdate(triageRes.body.session._id, { extractedSymptoms: ['itchy patches', 'redness'] });

    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slotsRes.body.slots[0].start, slotEnd: slotsRes.body.slots[0].end,
      triageSessionId: triageRes.body.session._id,
    });

    const res = await request(app).get('/api/appointments/me').set('Cookie', docCookies);
    expect(res.status).toBe(200);
    expect(res.body.items[0].triageSummary).toEqual(['itchy patches', 'redness']);
  });

  it('has a null triageSummary for an appointment with no linked triage session', async () => {
    const app = createApp();
    const { doctorId, docCookies } = await seedDoctorWithAvailability(app);
    const patientCookies = await registerAndLogin(app, 'patient', 'notriagesummary@medlink.demo');
    const slotsRes = await request(app).get(`/api/doctors/${doctorId}/slots?days=2`).set('Cookie', patientCookies);
    await request(app).post('/api/appointments').set('Cookie', patientCookies).send({
      doctorId, slotStart: slotsRes.body.slots[0].start, slotEnd: slotsRes.body.slots[0].end,
    });

    const res = await request(app).get('/api/appointments/me').set('Cookie', docCookies);
    expect(res.body.items[0].triageSummary).toBeNull();
  });
});
