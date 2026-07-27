import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../lib/db';
import { User } from '../models/User';
import { PatientProfile } from '../models/PatientProfile';
import { DoctorProfile } from '../models/DoctorProfile';
import { LabProfile } from '../models/LabProfile';
import { Notification } from '../models/Notification';
import { PATIENTS, DOCTORS, LABS } from './data';

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
