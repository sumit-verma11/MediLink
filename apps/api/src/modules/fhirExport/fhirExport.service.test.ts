import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User } from '../../models/User';
import { PatientProfile } from '../../models/PatientProfile';
import { DoctorProfile } from '../../models/DoctorProfile';
import { Appointment } from '../../models/Appointment';
import { canExportPatient, buildFhirBundle } from './fhirExport.service';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) await collections[key]?.deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function makePatient() {
  const user = await User.create({ role: 'patient', email: `p${Date.now()}@x.com`, phone: '9999999999', passwordHash: 'h', name: 'Pat' });
  await PatientProfile.create({ userId: user._id, age: 30, gender: 'female' });
  return user;
}

describe('canExportPatient', () => {
  it('authorizes a patient exporting their own data', async () => {
    const patient = await makePatient();
    expect(await canExportPatient({ id: patient._id.toString(), role: 'patient' }, patient._id.toString())).toBe(true);
  });

  it('rejects a patient exporting someone else\'s data', async () => {
    const patientA = await makePatient();
    const patientB = await makePatient();
    expect(await canExportPatient({ id: patientA._id.toString(), role: 'patient' }, patientB._id.toString())).toBe(false);
  });

  it('authorizes a doctor who has an appointment with the patient', async () => {
    const patient = await makePatient();
    const docUser = await User.create({ role: 'doctor', email: `d${Date.now()}@x.com`, phone: '9999999999', passwordHash: 'h', name: 'Doc' });
    const docProfile = await DoctorProfile.create({
      userId: docUser._id, specialties: ['GP'], qualifications: ['MBBS'], regNo: 'X/1', experienceYears: 1,
      bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 100, languages: ['English'],
    });
    await Appointment.create({ patientId: patient._id, doctorId: docProfile._id, slotStart: new Date(), slotEnd: new Date(), status: 'completed' });
    expect(await canExportPatient({ id: docUser._id.toString(), role: 'doctor' }, patient._id.toString())).toBe(true);
  });

  it('rejects a doctor with no appointment history for the patient', async () => {
    const patient = await makePatient();
    const docUser = await User.create({ role: 'doctor', email: `d2${Date.now()}@x.com`, phone: '9999999999', passwordHash: 'h', name: 'Doc2' });
    await DoctorProfile.create({
      userId: docUser._id, specialties: ['GP'], qualifications: ['MBBS'], regNo: 'X/2', experienceYears: 1,
      bio: 'b', clinicName: 'C', clinicAddress: 'A', city: 'Noida', geo: { lat: 1, lng: 1 }, consultationFee: 100, languages: ['English'],
    });
    expect(await canExportPatient({ id: docUser._id.toString(), role: 'doctor' }, patient._id.toString())).toBe(false);
  });

  it('always authorizes admin', async () => {
    const patient = await makePatient();
    expect(await canExportPatient({ id: new mongoose.Types.ObjectId().toString(), role: 'admin' }, patient._id.toString())).toBe(true);
  });
});

describe('buildFhirBundle', () => {
  it('returns a Bundle with a Patient entry for a patient with no history yet', async () => {
    const patient = await makePatient();
    const bundle = await buildFhirBundle(patient._id.toString(), {});
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.entry.some((e) => e.resource.resourceType === 'Patient')).toBe(true);
  });
});
