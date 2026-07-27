import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Appointment } from '../models/Appointment';
import { User } from '../models/User';
import { DoctorProfile } from '../models/DoctorProfile';

vi.mock('nodemailer', async () => {
  const mock = await import('nodemailer-mock');
  return mock;
});
import nodemailer from 'nodemailer-mock';
import { runReminderScan } from './reminderJob';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
beforeEach(() => {
  nodemailer.mock.reset();
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function seedConfirmedAppointment(hoursFromNow: number) {
  const patient = await User.create({ role: 'patient', email: `p-${Date.now()}-${Math.random()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'P' });
  const doctorUser = await User.create({ role: 'doctor', email: `d-${Date.now()}-${Math.random()}@medlink.demo`, phone: '9999999999', passwordHash: 'x', name: 'D' });
  const doctorProfile = await DoctorProfile.create({
    userId: doctorUser._id, specialties: ['X'], qualifications: ['MBBS'], regNo: 'DMC/R/1',
    experienceYears: 1, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida',
    geo: { lat: 1, lng: 1 }, consultationFee: 100, languages: ['English'],
  });
  const slotStart = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  return Appointment.create({
    patientId: patient._id, doctorId: doctorProfile._id, slotStart, slotEnd: new Date(slotStart.getTime() + 15 * 60 * 1000),
    status: 'confirmed',
  });
}

describe('runReminderScan', () => {
  it('sends a reminder for an appointment ~24h out and marks reminderSentAt', async () => {
    const appt = await seedConfirmedAppointment(24);
    const sentCount = await runReminderScan();
    expect(sentCount).toBe(1);

    const updated = await Appointment.findById(appt._id);
    expect(updated!.reminderSentAt).toBeInstanceOf(Date);
    expect(nodemailer.mock.getSentMail()).toHaveLength(1);
  });

  it('does not send twice for an appointment already reminded', async () => {
    const appt = await seedConfirmedAppointment(24);
    await runReminderScan();
    nodemailer.mock.reset();

    const secondRun = await runReminderScan();
    expect(secondRun).toBe(0);
    expect(nodemailer.mock.getSentMail()).toHaveLength(0);
  });

  it('does not send for an appointment far in the future', async () => {
    await seedConfirmedAppointment(72);
    const sentCount = await runReminderScan();
    expect(sentCount).toBe(0);
  });

  it('does not send for a non-confirmed appointment', async () => {
    const patient = await User.create({ role: 'patient', email: 'rp@medlink.demo', phone: '9999999999', passwordHash: 'x', name: 'P' });
    const doctorUser = await User.create({ role: 'doctor', email: 'rd@medlink.demo', phone: '9999999999', passwordHash: 'x', name: 'D' });
    const doctorProfile = await DoctorProfile.create({
      userId: doctorUser._id, specialties: ['X'], qualifications: ['MBBS'], regNo: 'DMC/R/2',
      experienceYears: 1, bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida',
      geo: { lat: 1, lng: 1 }, consultationFee: 100, languages: ['English'],
    });
    const slotStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await Appointment.create({
      patientId: patient._id, doctorId: doctorProfile._id, slotStart, slotEnd: new Date(slotStart.getTime() + 15 * 60 * 1000),
      status: 'requested',
    });

    const sentCount = await runReminderScan();
    expect(sentCount).toBe(0);
  });
});
