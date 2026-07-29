import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createPrescription } from './prescriptions.service';
import { Appointment } from '../../models/Appointment';
import { DoctorProfile } from '../../models/DoctorProfile';
import { User } from '../../models/User';
import { Prescription } from '../../models/Prescription';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Prescription.init();
  await Appointment.init();
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function seedConfirmedAppointment() {
  const doctorUser = await User.create({ role: 'doctor', email: `doc-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Dr Test' });
  const patientUser = await User.create({ role: 'patient', email: `pat-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Patient Test' });
  const doctorProfile = await DoctorProfile.create({
    userId: doctorUser._id, specialties: ['General Physician'], qualifications: ['MBBS'], regNo: 'DMC/R/12345',
    experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 },
    consultationFee: 500, languages: ['English'], verificationStatus: 'approved', avgRating: 4.5,
  });
  const appointment = await Appointment.create({
    patientId: patientUser._id, doctorId: doctorProfile._id,
    slotStart: new Date(Date.now() - 60 * 60 * 1000), slotEnd: new Date(Date.now() - 30 * 60 * 1000),
    status: 'confirmed', timeline: [{ status: 'confirmed', at: new Date(), by: doctorUser._id }],
  });
  return { doctorUser, patientUser, doctorProfile, appointment };
}

describe('createPrescription', () => {
  it('creates a prescription and auto-completes the appointment', async () => {
    const { doctorUser, patientUser, appointment } = await seedConfirmedAppointment();

    const prescription = await createPrescription(doctorUser._id.toString(), {
      appointmentId: appointment._id.toString(),
      diagnosisNote: 'Viral fever',
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest and fluids',
    });

    expect(prescription.diagnosisNote).toBe('Viral fever');
    expect(prescription.patientId.toString()).toBe(patientUser._id.toString());
    expect(prescription.version).toBe(1);

    const updatedAppointment = await Appointment.findById(appointment._id);
    expect(updatedAppointment!.status).toBe('completed');
  });

  it('rejects a doctor who does not own the appointment', async () => {
    const { appointment } = await seedConfirmedAppointment();
    const otherDoctorUser = await User.create({ role: 'doctor', email: `other-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Dr Other' });
    await DoctorProfile.create({
      userId: otherDoctorUser._id, specialties: ['Cardiology'], qualifications: ['MBBS'], regNo: 'DMC/R/54321',
      experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 },
      consultationFee: 500, languages: ['English'], verificationStatus: 'approved', avgRating: 4.5,
    });

    await expect(
      createPrescription(otherDoctorUser._id.toString(), {
        appointmentId: appointment._id.toString(),
        diagnosisNote: 'x', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
      })
    ).rejects.toThrow();
  });

  it('rejects an appointment that is not confirmed', async () => {
    const { doctorUser, appointment } = await seedConfirmedAppointment();
    appointment.status = 'requested';
    await appointment.save();

    await expect(
      createPrescription(doctorUser._id.toString(), {
        appointmentId: appointment._id.toString(),
        diagnosisNote: 'x', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
      })
    ).rejects.toThrow();
  });
});
