import fs from 'node:fs';
import path from 'node:path';
import { Prescription, IPrescription } from '../../models/Prescription';
import { Appointment } from '../../models/Appointment';
import { DoctorProfile, IDoctorProfile } from '../../models/DoctorProfile';
import { User } from '../../models/User';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/audit.service';
import { emitAppointmentUpdate } from '../../lib/socket';
import { appendTimelineEntry } from '../appointments/appointments.service';
import { generatePrescriptionPdf } from './prescriptions.pdf';
import type { CreatePrescriptionInput, AmendPrescriptionInput } from '@medlink/shared';

const PDF_DIR = path.join(process.cwd(), 'uploads', 'prescriptions');
fs.mkdirSync(PDF_DIR, { recursive: true });

async function generateAndSavePdf(prescription: IPrescription, doctorProfile: IDoctorProfile): Promise<string> {
  const [doctorUser, patientUser] = await Promise.all([
    User.findById(doctorProfile.userId),
    User.findById(prescription.patientId),
  ]);
  const buffer = await generatePrescriptionPdf({
    prescription,
    doctorProfile,
    doctorUser: doctorUser!,
    patientUser: patientUser!,
    verifyBaseUrl: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  });
  const filename = `${prescription._id.toString()}.pdf`;
  fs.writeFileSync(path.join(PDF_DIR, filename), buffer);
  return `/uploads/prescriptions/${filename}`;
}

export async function createPrescription(
  doctorUserId: string,
  input: CreatePrescriptionInput
): Promise<IPrescription> {
  const doctorProfile = await DoctorProfile.findOne({ userId: doctorUserId });
  if (!doctorProfile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');

  const appointment = await Appointment.findOne({ _id: input.appointmentId, doctorId: doctorProfile._id });
  if (!appointment) throw new AppError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
  if (appointment.status !== 'confirmed') {
    throw new AppError(409, 'Prescriptions can only be written for confirmed appointments', 'INVALID_APPOINTMENT_STATUS');
  }

  // Atomically claim the confirmed->completed transition BEFORE creating the
  // prescription document. The status guard folded into the filter ensures
  // at most one concurrent caller can win this -- a second caller (or a
  // patient cancelling concurrently) sees a null result and this function
  // errors out instead of silently creating an orphaned Prescription for an
  // appointment that never actually completed.
  const updatedAppointment = await appendTimelineEntry(appointment._id.toString(), 'completed', doctorUserId, {}, {
    doctorId: doctorProfile._id,
    status: 'confirmed',
  });
  if (!updatedAppointment) {
    throw new AppError(409, 'This appointment is no longer confirmed', 'APPOINTMENT_STATE_CHANGED');
  }

  const prescription = await Prescription.create({
    appointmentId: appointment._id,
    doctorId: doctorProfile._id,
    patientId: appointment.patientId,
    diagnosisNote: input.diagnosisNote,
    medicines: input.medicines,
    advice: input.advice,
    followUpDate: input.followUpDate,
    recommendedTests: input.recommendedTests ?? [],
  });

  prescription.pdfUrl = await generateAndSavePdf(prescription, doctorProfile);
  await prescription.save();

  emitAppointmentUpdate(doctorUserId, updatedAppointment);
  emitAppointmentUpdate(updatedAppointment.patientId.toString(), updatedAppointment);

  await logAudit({
    actorId: doctorUserId, actorRole: 'doctor', action: 'prescription.created',
    entityType: 'Prescription', entityId: prescription._id.toString(),
    meta: { appointmentId: appointment._id.toString() },
  });

  return prescription;
}

export async function amendPrescription(
  doctorUserId: string,
  prescriptionId: string,
  input: AmendPrescriptionInput
): Promise<IPrescription> {
  const doctorProfile = await DoctorProfile.findOne({ userId: doctorUserId });
  if (!doctorProfile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');

  const original = await Prescription.findOne({ _id: prescriptionId, doctorId: doctorProfile._id });
  if (!original) throw new AppError(404, 'Prescription not found', 'PRESCRIPTION_NOT_FOUND');
  if (original.supersededBy) {
    throw new AppError(409, 'This prescription has already been amended', 'ALREADY_AMENDED');
  }

  const amended = await Prescription.create({
    appointmentId: original.appointmentId,
    doctorId: original.doctorId,
    patientId: original.patientId,
    diagnosisNote: input.diagnosisNote,
    medicines: input.medicines,
    advice: input.advice,
    followUpDate: input.followUpDate,
    recommendedTests: input.recommendedTests ?? [],
    version: original.version + 1,
  });

  amended.pdfUrl = await generateAndSavePdf(amended, doctorProfile);
  await amended.save();

  // Atomically claim the "not yet superseded" slot on the original -- the
  // filter's `supersededBy: { $exists: false }` guard means at most one
  // concurrent amend call can win this update, even though the v2 document
  // above was already created optimistically.
  const linked = await Prescription.findOneAndUpdate(
    { _id: original._id, doctorId: doctorProfile._id, supersededBy: { $exists: false } },
    { $set: { supersededBy: amended._id } },
    { new: true }
  );
  if (!linked) {
    // Lost the race -- another amend call linked the original first. The v2
    // we just created is now an orphan; remove it rather than leaving a
    // dangling, unlinked prescription document.
    await Prescription.deleteOne({ _id: amended._id });
    throw new AppError(409, 'This prescription has already been amended', 'ALREADY_AMENDED');
  }

  await logAudit({
    actorId: doctorUserId, actorRole: 'doctor', action: 'prescription.amended',
    entityType: 'Prescription', entityId: amended._id.toString(),
    meta: { supersedes: original._id.toString() },
  });

  return amended;
}
