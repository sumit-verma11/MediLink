import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../lib/db';
import { User } from '../models/User';
import { PatientProfile } from '../models/PatientProfile';
import { DoctorProfile } from '../models/DoctorProfile';
import { LabProfile } from '../models/LabProfile';
import { Notification } from '../models/Notification';
import { AvailabilityRule } from '../models/AvailabilityRule';
import { Appointment } from '../models/Appointment';
import { PATIENTS, DOCTORS, LABS, AVAILABILITY_RULES_BY_DOCTOR_EMAIL } from './data';

const DEMO_PASSWORD = 'Demo@123';

async function hashed(): Promise<string> {
  return bcrypt.hash(DEMO_PASSWORD, 10);
}

export async function runSeed(): Promise<void> {
  await User.deleteMany({});
  await PatientProfile.deleteMany({});
  await DoctorProfile.deleteMany({});
  await LabProfile.deleteMany({});
  await Notification.deleteMany({});
  await AvailabilityRule.deleteMany({});
  await Appointment.deleteMany({});

  const passwordHash = await hashed();

  const admin = await User.create({
    role: 'admin', email: 'admin@medlink.demo', phone: '9800000000', passwordHash, name: 'Admin',
    avatarUrl: 'https://i.pravatar.cc/150?u=admin@medlink.demo', isVerified: true,
  });

  for (const p of PATIENTS) {
    const user = await User.create({
      role: 'patient', email: p.email, phone: p.phone, passwordHash, name: p.name,
      avatarUrl: `https://i.pravatar.cc/150?u=${p.email}`, isVerified: true,
    });
    await PatientProfile.create({ userId: user._id, age: p.age, gender: p.gender, city: p.city });
    await Notification.create({
      userId: user._id, type: 'welcome', title: 'Welcome to MedLink',
      body: 'Your account is ready.', createdAt: new Date(),
    });
  }

  for (const d of DOCTORS) {
    const user = await User.create({
      role: 'doctor', email: d.email, phone: '9800000001', passwordHash, name: d.name,
      avatarUrl: `https://i.pravatar.cc/150?u=${d.email}`, isVerified: true,
    });
    await DoctorProfile.create({
      userId: user._id, specialties: d.specialties, qualifications: ['MBBS'],
      regNo: `DMC/R/${String(Math.floor(10000 + Math.random() * 89999))}`,
      experienceYears: d.exp, bio: `${d.name} is an experienced ${d.specialties[0]} practitioner.`,
      clinicName: `${d.name.replace('Dr. ', '')} Clinic`, clinicAddress: `${d.city} Main Road`,
      city: d.city, geo: { lat: 28.5, lng: 77.3 }, consultationFee: d.fee,
      languages: ['English', 'Hindi'], verificationStatus: d.status,
      avgRating: d.status === 'approved' ? Number((3.9 + Math.random() * 0.9).toFixed(1)) : 0,
      ratingCount: d.status === 'approved' ? Math.floor(12 + Math.random() * 148) : 0,
    });
    await Notification.create({
      userId: user._id, type: 'welcome', title: 'Welcome to MedLink',
      body: 'Your profile is set up.', createdAt: new Date(),
    });
  }

  for (const l of LABS) {
    const user = await User.create({
      role: 'lab', email: l.email, phone: '9800000002', passwordHash, name: l.name,
      avatarUrl: `https://i.pravatar.cc/150?u=${l.email}`, isVerified: true,
    });
    await LabProfile.create({
      userId: user._id, labName: l.name, address: `${l.city} Diagnostic Rd`, city: l.city,
      geo: { lat: 28.5, lng: 77.3 }, timings: '07:00-21:00', homeCollection: l.homeCollection,
      verificationStatus: l.status, tests: l.tests,
    });
    await Notification.create({
      userId: user._id, type: 'welcome', title: 'Welcome to MedLink',
      body: 'Your lab profile is set up.', createdAt: new Date(),
    });
  }

  const doctorUsersByEmail = new Map<string, { userId: import('mongoose').Types.ObjectId; profileId: import('mongoose').Types.ObjectId }>();
  for (const d of DOCTORS) {
    const user = await User.findOne({ email: d.email });
    const profile = await DoctorProfile.findOne({ userId: user!._id });
    if (user && profile) doctorUsersByEmail.set(d.email, { userId: user._id, profileId: profile._id });

    const rules = AVAILABILITY_RULES_BY_DOCTOR_EMAIL[d.email];
    if (rules && profile) {
      for (const rule of rules) {
        await AvailabilityRule.create({
          doctorId: profile._id, ...rule,
          // Relative to seed time (±1 year) rather than a hardcoded calendar year, so
          // the demo's slot generation never silently goes dark on a fixed date.
          validFrom: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        });
      }
    }
  }

  const patientUsers = await Promise.all(PATIENTS.map((p) => User.findOne({ email: p.email })));
  const meera = doctorUsersByEmail.get('meera.d@medlink.demo')!;
  const kavita = doctorUsersByEmail.get('kavita.d@medlink.demo')!;
  const rohit = doctorUsersByEmail.get('rohit.d@medlink.demo')!;
  const anjali = doctorUsersByEmail.get('anjali.d@medlink.demo')!;

  function daysAgo(n: number): Date {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  }
  function daysFromNow(n: number): Date {
    return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  }
  function withTimeline(status: string, patientId: import('mongoose').Types.ObjectId) {
    return [{ status, at: new Date(), by: patientId }];
  }

  const appointmentSeeds = [
    // 7 completed, past 2 weeks (6 of these get a Prescription in Phase 4; the 7th,
    // last entry below, is CLAUDE.md §6.4's "1 completed-without-prescription" — a
    // genuinely separate appointment, not one of the 6, so Phase 4 has exactly one
    // completed appointment it should NOT attach a prescription to)
    { doctorId: meera.profileId, patientId: patientUsers[0]!._id, slotStart: daysAgo(2), status: 'completed' },
    { doctorId: kavita.profileId, patientId: patientUsers[1]!._id, slotStart: daysAgo(3), status: 'completed' },
    { doctorId: rohit.profileId, patientId: patientUsers[2]!._id, slotStart: daysAgo(5), status: 'completed' },
    { doctorId: anjali.profileId, patientId: patientUsers[3]!._id, slotStart: daysAgo(7), status: 'completed' },
    { doctorId: meera.profileId, patientId: patientUsers[4]!._id, slotStart: daysAgo(10), status: 'completed' },
    { doctorId: kavita.profileId, patientId: patientUsers[5]!._id, slotStart: daysAgo(12), status: 'completed' },
    { doctorId: rohit.profileId, patientId: patientUsers[4]!._id, slotStart: daysAgo(14), status: 'completed' }, // completed-without-prescription
    // 3 confirmed, next 3 days
    { doctorId: meera.profileId, patientId: patientUsers[0]!._id, slotStart: daysFromNow(1), status: 'confirmed' },
    { doctorId: rohit.profileId, patientId: patientUsers[1]!._id, slotStart: daysFromNow(2), status: 'confirmed' },
    { doctorId: anjali.profileId, patientId: patientUsers[2]!._id, slotStart: daysFromNow(3), status: 'confirmed' },
    // 2 requested, pending on Dr. Meera + Dr. Kavita
    // (offset by 6h from the Meera 'confirmed' slot above: both share doctorId + status in
    // the {requested, confirmed} set that Appointment's partial unique index guards, so an
    // identical slotStart would violate doctorId_1_slotStart_1 — same slot can't be both.)
    { doctorId: meera.profileId, patientId: patientUsers[3]!._id, slotStart: daysFromNow(1.25), status: 'requested' },
    { doctorId: kavita.profileId, patientId: patientUsers[4]!._id, slotStart: daysFromNow(2), status: 'requested' },
    // 1 rejected
    { doctorId: rohit.profileId, patientId: patientUsers[3]!._id, slotStart: daysAgo(1), status: 'rejected', rejectionReason: 'Please book with a pediatrician for a child patient' },
    // 1 cancelled, 1 no_show
    { doctorId: anjali.profileId, patientId: patientUsers[5]!._id, slotStart: daysFromNow(4), status: 'cancelled' },
    { doctorId: meera.profileId, patientId: patientUsers[2]!._id, slotStart: daysAgo(4), status: 'no_show' },
  ];

  for (const seed of appointmentSeeds) {
    await Appointment.create({
      doctorId: seed.doctorId,
      patientId: seed.patientId,
      slotStart: seed.slotStart,
      slotEnd: new Date(seed.slotStart.getTime() + 15 * 60 * 1000),
      status: seed.status,
      rejectionReason: (seed as { rejectionReason?: string }).rejectionReason,
      timeline: withTimeline(seed.status, seed.patientId),
    });
  }

  await Notification.create({
    userId: admin._id, type: 'admin', title: 'Pending verifications',
    body: '2 verification requests are awaiting your review.', createdAt: new Date(),
  });
}

if (require.main === module) {
  connectDB(process.env.MONGO_URI ?? 'mongodb://localhost:27017/medlink')
    .then(runSeed)
    .then(disconnectDB)
    .then(() => {
      console.log('Seed complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
