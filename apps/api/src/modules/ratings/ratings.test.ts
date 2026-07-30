import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createRating, listRatingsForDoctor } from './ratings.service';
import { User } from '../../models/User';
import { DoctorProfile } from '../../models/DoctorProfile';
import { Appointment } from '../../models/Appointment';
import { Rating } from '../../models/Rating';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Rating.init();
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
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
