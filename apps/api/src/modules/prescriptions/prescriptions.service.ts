import fs from 'node:fs';
import path from 'node:path';
import type { HydratedDocument } from 'mongoose';
import { Prescription, IPrescription } from '../../models/Prescription';
import { Appointment } from '../../models/Appointment';
import { DoctorProfile, IDoctorProfile } from '../../models/DoctorProfile';
import { User } from '../../models/User';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/audit.service';
import { emitAppointmentUpdate } from '../../lib/socket';
import { appendTimelineEntry } from '../appointments/appointments.service';
import { generatePrescriptionPdf } from './prescriptions.pdf';
import { logger } from '../../lib/logger';
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

// PDF generation touches a separate User lookup and a filesystem write, either of
// which can fail independently of the Prescription document itself being valid. A
// failure here must never surface as a 500 to the caller: the appointment has
// already atomically transitioned and the Prescription document (the source of
// truth, already audit-logged by the caller) exists and is fully usable without a
// PDF. Leave pdfUrl unset and let the caller return the degraded-but-recoverable
// prescription rather than throwing into a stuck, unrecoverable state.
async function tryAttachPdf(prescription: HydratedDocument<IPrescription>, doctorProfile: IDoctorProfile, context: string): Promise<void> {
  try {
    prescription.pdfUrl = await generateAndSavePdf(prescription, doctorProfile);
    await prescription.save();
  } catch (err) {
    logger.error(err, `Failed to generate ${context} PDF; continuing without one`);
  }
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

  // Audit the creation immediately -- this is the real "a prescription was
  // written" event, and it must be recorded regardless of whether PDF
  // generation (a separate, independently-failable step) succeeds afterward.
  await logAudit({
    actorId: doctorUserId, actorRole: 'doctor', action: 'prescription.created',
    entityType: 'Prescription', entityId: prescription._id.toString(),
    meta: { appointmentId: appointment._id.toString() },
  });

  await tryAttachPdf(prescription, doctorProfile, 'prescription');

  emitAppointmentUpdate(doctorUserId, updatedAppointment);
  emitAppointmentUpdate(updatedAppointment.patientId.toString(), updatedAppointment);

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

  // Atomically claim the "not yet superseded" slot on the original BEFORE
  // generating a PDF for the v2 document -- the filter's
  // `supersededBy: { $exists: false }` guard means at most one concurrent
  // amend call can win this update. Doing this before PDF generation means a
  // lost race never leaves an orphaned PDF file on disk: if we lose, no PDF
  // was ever written for `amended`, so deleting the DB document is the only
  // cleanup needed.
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

  // The claim succeeded -- this amend is now real and permanent. Audit it
  // immediately, before attempting PDF generation (a separate,
  // independently-failable step further below).
  await logAudit({
    actorId: doctorUserId, actorRole: 'doctor', action: 'prescription.amended',
    entityType: 'Prescription', entityId: amended._id.toString(),
    meta: { supersedes: original._id.toString() },
  });

  await tryAttachPdf(amended, doctorProfile, 'amended prescription');

  return amended;
}

export async function getPublicVerification(prescriptionId: string): Promise<{
  doctorName: string;
  regNo: string;
  clinicName: string;
  issuedAt: Date;
  version: number;
  isLatestVersion: boolean;
} | null> {
  const prescription = await Prescription.findById(prescriptionId);
  if (!prescription) return null;

  const doctorProfile = await DoctorProfile.findById(prescription.doctorId);
  if (!doctorProfile) return null;
  const doctorUser = await User.findById(doctorProfile.userId);
  if (!doctorUser) return null;

  return {
    doctorName: doctorUser.name,
    regNo: doctorProfile.regNo,
    clinicName: doctorProfile.clinicName,
    issuedAt: prescription.createdAt,
    version: prescription.version,
    isLatestVersion: !prescription.supersededBy,
  };
}

export async function listMyPrescriptions(
  patientUserId: string,
  page: number,
  limit: number
): Promise<{ items: IPrescription[]; total: number; page: number; limit: number }> {
  const cappedLimit = Math.min(50, limit);
  const [items, total] = await Promise.all([
    Prescription.find({ patientId: patientUserId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * cappedLimit)
      .limit(cappedLimit),
    Prescription.countDocuments({ patientId: patientUserId }),
  ]);
  return { items, total, page, limit: cappedLimit };
}

export async function getPrescriptionPdfPath(
  prescriptionId: string,
  requestingUserId: string,
  requestingRole: string
): Promise<string> {
  const prescription = await Prescription.findById(prescriptionId);
  if (!prescription) throw new AppError(404, 'Prescription not found', 'PRESCRIPTION_NOT_FOUND');

  let authorized = false;
  if (requestingRole === 'patient' && prescription.patientId.toString() === requestingUserId) {
    authorized = true;
  } else if (requestingRole === 'doctor') {
    const doctorProfile = await DoctorProfile.findOne({ userId: requestingUserId });
    if (doctorProfile && prescription.doctorId.toString() === doctorProfile._id.toString()) {
      authorized = true;
    }
  }
  if (!authorized) throw new AppError(404, 'Prescription not found', 'PRESCRIPTION_NOT_FOUND');
  if (!prescription.pdfUrl) throw new AppError(404, 'Prescription PDF not available', 'PDF_NOT_AVAILABLE');

  return path.join(process.cwd(), prescription.pdfUrl.replace(/^\//, ''));
}
