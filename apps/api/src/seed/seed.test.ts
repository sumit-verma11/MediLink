import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runSeed } from './seed';
import { DOCTORS } from './data';
import { User } from '../models/User';
import { DoctorProfile } from '../models/DoctorProfile';
import { LabProfile } from '../models/LabProfile';
import { Appointment } from '../models/Appointment';
import { AvailabilityRule } from '../models/AvailabilityRule';
import { TriageSession } from '../models/TriageSession';
import { Prescription } from '../models/Prescription';
import { LabReferral } from '../models/LabReferral';
import { LabBooking } from '../models/LabBooking';
import { Rating } from '../models/Rating';
import { Notification } from '../models/Notification';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('runSeed', () => {
  it('is idempotent and creates the expected demo accounts', async () => {
    await runSeed();
    await runSeed(); // run twice to prove idempotency

    const admin = await User.findOne({ email: 'admin@medlink.demo' });
    expect(admin).not.toBeNull();

    const doctors = await User.find({ role: 'doctor' });
    expect(doctors).toHaveLength(DOCTORS.length);

    const expectedApproved = DOCTORS.filter((d) => d.status === 'approved').length;
    const expectedPending = DOCTORS.filter((d) => d.status === 'pending').length;
    const approvedDoctors = await DoctorProfile.countDocuments({ verificationStatus: 'approved' });
    expect(approvedDoctors).toBe(expectedApproved);
    const pendingDoctors = await DoctorProfile.countDocuments({ verificationStatus: 'pending' });
    expect(pendingDoctors).toBe(expectedPending);

    const labs = await User.find({ role: 'lab' });
    expect(labs).toHaveLength(4);
    const pendingLabs = await LabProfile.countDocuments({ verificationStatus: 'pending' });
    expect(pendingLabs).toBe(1);

    const patients = await User.find({ role: 'patient' });
    expect(patients).toHaveLength(6);
  });
});

describe('runSeed — Phase 2 slice', () => {
  it('seeds availability rules for approved doctors and exactly 15 appointments with the spec\'d status distribution', async () => {
    await runSeed();

    const ruleCount = await AvailabilityRule.countDocuments({});
    expect(ruleCount).toBeGreaterThan(0);

    const appointments = await Appointment.find({});
    expect(appointments).toHaveLength(15);

    const counts: Record<string, number> = {};
    for (const appt of appointments) counts[appt.status] = (counts[appt.status] ?? 0) + 1;

    // CLAUDE.md §6.4 lists "6 completed ... each with prescription" as distinct from
    // the separately-listed "1 completed-without-prescription" — 7 completed total,
    // not 6. Phase 4 is what actually distinguishes the two (by whether a Prescription
    // document references the appointment); this phase just needs the status counts right.
    expect(counts.completed).toBe(7);
    expect(counts.confirmed).toBe(3);
    expect(counts.requested).toBe(2);
    expect(counts.rejected).toBe(1);
    expect(counts.cancelled).toBe(1);
    expect(counts.no_show).toBe(1);
  });
});

describe('runSeed — Phase 3 slice', () => {
  it('seeds exactly 4 triage sessions, one of which is a red-flag case, and links at least 2 to completed appointments', async () => {
    await runSeed();

    const sessions = await TriageSession.find({});
    expect(sessions).toHaveLength(4);

    const redFlagSessions = sessions.filter((s) => s.isRedFlag);
    expect(redFlagSessions).toHaveLength(1);

    const linkedCount = await Appointment.countDocuments({ triageSessionId: { $ne: null } });
    expect(linkedCount).toBeGreaterThanOrEqual(2);
  });
});

describe('runSeed — Phase 4 slice', () => {
  it('seeds exactly 6 prescriptions, at least 3 with recommendedTests, all linked to completed appointments', async () => {
    await runSeed();
    const prescriptions = await Prescription.find({});
    expect(prescriptions).toHaveLength(6);

    const withTests = prescriptions.filter((p) => p.recommendedTests.length > 0);
    expect(withTests.length).toBeGreaterThanOrEqual(3);

    for (const rx of prescriptions) {
      const appointment = await Appointment.findById(rx.appointmentId);
      expect(appointment).not.toBeNull();
      expect(appointment!.status).toBe('completed');
    }
  });
});

describe('runSeed — Phase 5 slice', () => {
  it('seeds exactly 3 lab referrals in the documented statuses, plus lab bookings including one walk-in', async () => {
    await runSeed();
    const referrals = await LabReferral.find({});
    expect(referrals).toHaveLength(3);

    const statuses = referrals.map((r) => r.status).sort();
    expect(statuses).toEqual(['booked', 'report_ready', 'sent'].sort());

    const reportReadyReferral = referrals.find((r) => r.status === 'report_ready');
    expect(reportReadyReferral!.reportUrl).toBeTruthy();

    const bookings = await LabBooking.find({});
    expect(bookings.length).toBeGreaterThanOrEqual(3); // 2 progressed referrals + 1 walk-in
    const walkIns = bookings.filter((b) => !b.referralId);
    expect(walkIns.length).toBeGreaterThanOrEqual(1);
  });
});

describe('runSeed — Phase 6 slice (ratings, lab referral notification)', () => {
  it('seeds one rating per completed appointment via the real createRating path, recomputing avgRating/ratingCount per doctor', async () => {
    await runSeed();

    const ratings = await Rating.find({});
    // Rating.appointmentId is unique and createRating requires status 'completed' --
    // with exactly 7 completed appointments seeded (Phase 2 slice above), 7 is the
    // maximum achievable, in place of CLAUDE.md §6.4's "8" (written before that
    // constraint was enforced by the real service).
    expect(ratings).toHaveLength(7);

    const meeraUser = await User.findOne({ email: 'meera.d@medlink.demo' });
    const meeraProfile = await DoctorProfile.findOne({ userId: meeraUser!._id });
    expect(meeraProfile!.ratingCount).toBe(2);
    expect(meeraProfile!.avgRating).toBeCloseTo(3.5, 5);

    const kavitaUser = await User.findOne({ email: 'kavita.d@medlink.demo' });
    const kavitaProfile = await DoctorProfile.findOne({ userId: kavitaUser!._id });
    expect(kavitaProfile!.ratingCount).toBe(2);
    expect(kavitaProfile!.avgRating).toBeCloseTo(4.5, 5);

    const rohitUser = await User.findOne({ email: 'rohit.d@medlink.demo' });
    const rohitProfile = await DoctorProfile.findOne({ userId: rohitUser!._id });
    expect(rohitProfile!.ratingCount).toBe(2);
    expect(rohitProfile!.avgRating).toBeCloseTo(4.0, 5);

    const anjaliUser = await User.findOne({ email: 'anjali.d@medlink.demo' });
    const anjaliProfile = await DoctorProfile.findOne({ userId: anjaliUser!._id });
    expect(anjaliProfile!.ratingCount).toBe(1);
    expect(anjaliProfile!.avgRating).toBeCloseTo(3.0, 5);

    // A doctor with no completed appointments keeps the schema default (0), not a
    // Math.random() fake -- this is the behavior this task's change is actually about.
    const arjunUser = await User.findOne({ email: 'arjun.d@medlink.demo' });
    const arjunProfile = await DoctorProfile.findOne({ userId: arjunUser!._id });
    expect(arjunProfile!.ratingCount).toBe(0);
    expect(arjunProfile!.avgRating).toBe(0);
  });

  it('notifies both the patient and the lab for the seeded "sent" lab referral', async () => {
    await runSeed();

    const cityPathUser = await User.findOne({ email: 'citypath.l@medlink.demo' });
    const labNotifications = await Notification.find({ userId: cityPathUser!._id });
    // 1 welcome notification (seeded for every lab) + 1 lab_referral_received for the
    // 'sent' CBC referral from Dr. Meera -- mirrors what createReferral itself sends.
    expect(labNotifications).toHaveLength(2);
    expect(labNotifications.some((n) => n.type === 'lab_referral_received')).toBe(true);
  });
});
