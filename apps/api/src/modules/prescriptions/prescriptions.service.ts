import { Types } from 'mongoose';
import { Prescription, IPrescription } from '../../models/Prescription';
import { Appointment } from '../../models/Appointment';
import { DoctorProfile } from '../../models/DoctorProfile';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/audit.service';
import { emitAppointmentUpdate } from '../../lib/socket';
import { appendTimelineEntry } from '../appointments/appointments.service';
import type { CreatePrescriptionInput, AmendPrescriptionInput } from '@medlink/shared';

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

  // Auto-transition the appointment to 'completed', reusing Phase 2's atomic
  // status-guard helper (single findOneAndUpdate with the guard folded into
  // the filter) rather than a bare save/$set.
  const updatedAppointment = await appendTimelineEntry(appointment._id.toString(), 'completed', doctorUserId, {}, {
    doctorId: doctorProfile._id,
    status: 'confirmed',
  });
  if (updatedAppointment) {
    emitAppointmentUpdate(doctorUserId, updatedAppointment);
    emitAppointmentUpdate(updatedAppointment.patientId.toString(), updatedAppointment);
  }

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

  original.supersededBy = amended._id;
  await original.save();

  await logAudit({
    actorId: doctorUserId, actorRole: 'doctor', action: 'prescription.amended',
    entityType: 'Prescription', entityId: amended._id.toString(),
    meta: { supersedes: original._id.toString() },
  });

  return amended;
}
