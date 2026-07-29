import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createPrescription, amendPrescription } from './prescriptions.service';
import * as appointmentsServiceModule from '../appointments/appointments.service';
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
  vi.restoreAllMocks();
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

  it('errors cleanly with zero side effects when appendTimelineEntry loses its own internal atomic race', async () => {
    const { doctorUser, appointment } = await seedConfirmedAppointment();

    // appendTimelineEntry's OWN internal atomic findOneAndUpdate is what actually
    // guards the confirmed->completed transition. Simulate it losing that race (e.g.
    // a concurrent cancel or a second prescription request winning first) by mocking
    // it to return null directly, the same way its real implementation would when its
    // filter matches nothing -- pre-mutating the DB before calling createPrescription
    // can't reach this branch, since createPrescription's own earlier
    // `appointment.status !== 'confirmed'` check intercepts that case first.
    vi.spyOn(appointmentsServiceModule, 'appendTimelineEntry').mockResolvedValueOnce(null);

    await expect(
      createPrescription(doctorUser._id.toString(), {
        appointmentId: appointment._id.toString(),
        diagnosisNote: 'x', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
      })
    ).rejects.toMatchObject({ statusCode: 409, code: 'APPOINTMENT_STATE_CHANGED' });

    // The key assertion: no orphaned Prescription was created for an
    // appointment that never actually transitioned to 'completed'.
    expect(await Prescription.countDocuments({ appointmentId: appointment._id })).toBe(0);
  });
});

describe('amendPrescription', () => {
  async function seedPrescription() {
    const { doctorUser, appointment } = await seedConfirmedAppointment();
    const prescription = await createPrescription(doctorUser._id.toString(), {
      appointmentId: appointment._id.toString(),
      diagnosisNote: 'Viral fever',
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest and fluids',
    });
    return { doctorUser, appointment, prescription };
  }

  it('amends a prescription and links original -> v2', async () => {
    const { doctorUser, prescription } = await seedPrescription();

    const amended = await amendPrescription(doctorUser._id.toString(), prescription._id.toString(), {
      diagnosisNote: 'Viral fever (revised)',
      medicines: [{ name: 'Paracetamol', dosage: '650mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest and fluids, revised',
    });

    expect(amended.version).toBe(2);

    const original = await Prescription.findById(prescription._id);
    expect(original!.supersededBy!.toString()).toBe(amended._id.toString());
  });

  it('rejects a doctor amending a prescription they did not write', async () => {
    const { prescription } = await seedPrescription();
    const otherDoctorUser = await User.create({
      role: 'doctor', email: `other-doc-${Date.now()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'Dr Other',
    });
    await DoctorProfile.create({
      userId: otherDoctorUser._id, specialties: ['Cardiology'], qualifications: ['MBBS'], regNo: `DMC/R/${Math.floor(Math.random() * 100000)}`,
      experienceYears: 5, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 },
      consultationFee: 500, languages: ['English'], verificationStatus: 'approved', avgRating: 4.5,
    });

    await expect(
      amendPrescription(otherDoctorUser._id.toString(), prescription._id.toString(), {
        diagnosisNote: 'v2', medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }], advice: 'x',
      })
    ).rejects.toThrow();

    const reloaded = await Prescription.findById(prescription._id);
    expect(reloaded!.supersededBy).toBeUndefined();
  });

  it('rejects amending when the atomic supersededBy-link claim loses its own race, without leaving an orphan v2', async () => {
    const { doctorUser, prescription } = await seedPrescription();

    // amendPrescription's own atomic linking step is `Prescription.findOneAndUpdate`
    // with a `supersededBy: { $exists: false }` guard. Simulate THAT specific call
    // losing its race (matching nothing, e.g. a concurrent amend already linked the
    // original a moment earlier) by mocking it directly -- pre-mutating
    // `supersededBy` on the DB before calling amendPrescription can't reach this
    // branch, since amendPrescription's own earlier `original.supersededBy` truthy
    // check intercepts that case first.
    const deleteOneSpy = vi.spyOn(Prescription, 'deleteOne');
    vi.spyOn(Prescription, 'findOneAndUpdate').mockResolvedValueOnce(null);

    await expect(
      amendPrescription(doctorUser._id.toString(), prescription._id.toString(), {
        diagnosisNote: 'y',
        medicines: [{ name: 'Paracetamol', dosage: '1', frequency: '1', durationDays: 1 }],
        advice: 'y',
      })
    ).rejects.toMatchObject({ statusCode: 409, code: 'ALREADY_AMENDED' });

    // The optimistically-created v2 must have been rolled back via deleteOne.
    expect(deleteOneSpy).toHaveBeenCalledTimes(1);

    // No orphaned v2 should survive: total count for this appointment/version
    // must be unchanged (still just the original at version 1).
    expect(
      await Prescription.countDocuments({ appointmentId: prescription.appointmentId, version: prescription.version + 1 })
    ).toBe(0);

    const original = await Prescription.findById(prescription._id);
    expect(original!.supersededBy).toBeUndefined();
  });
});
