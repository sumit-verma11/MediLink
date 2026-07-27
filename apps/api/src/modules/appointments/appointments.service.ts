import { Types } from 'mongoose';
import { Appointment, IAppointment, AppointmentStatus } from '../../models/Appointment';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/audit.service';
import { acquireSlotLock, releaseSlotLock } from './slotLock';
import { DoctorProfile } from '../../models/DoctorProfile';
import { emitAppointmentUpdate } from '../../lib/socket';
import type { CreateAppointmentInput } from '@medlink/shared';

export async function createAppointment(patientId: string, input: CreateAppointmentInput): Promise<IAppointment> {
  const slotStartISO = input.slotStart.toISOString();
  const acquired = await acquireSlotLock(input.doctorId, slotStartISO, patientId);
  if (!acquired) {
    throw new AppError(409, 'Slot is no longer available', 'SLOT_UNAVAILABLE');
  }

  let appointment: IAppointment;
  try {
    appointment = await Appointment.create({
      patientId: new Types.ObjectId(patientId),
      doctorId: new Types.ObjectId(input.doctorId),
      slotStart: input.slotStart,
      slotEnd: input.slotEnd,
      status: 'requested',
      symptomSummary: input.symptomSummary,
      triageSessionId: input.triageSessionId ? new Types.ObjectId(input.triageSessionId) : undefined,
      timeline: [{ status: 'requested', at: new Date(), by: new Types.ObjectId(patientId) }],
    });
  } catch (err) {
    // Only Appointment.create() failures land here (including a partial-unique-index
    // collision that slipped past the Redis lock, e.g. a pre-existing active appointment
    // from before this lock existed) — release the lock immediately so the slot isn't
    // stuck held for 5 minutes over a booking that never actually succeeded.
    await releaseSlotLock(input.doctorId, slotStartISO);
    if ((err as { code?: number }).code === 11000) {
      throw new AppError(409, 'Slot is no longer available', 'SLOT_UNAVAILABLE');
    }
    throw err;
  }

  // The appointment now exists in the database. A failure from here on (e.g. logAudit)
  // is a real problem worth surfacing as a 500, but it must NOT release the slot lock
  // (the booking succeeded — releasing it here would let a second patient grab the same
  // slot's lock, even though Mongo's unique index would still stop a duplicate write) and
  // must NOT be mapped to 409 (that would misrepresent a successful booking as a conflict).
  await logAudit({
    actorId: patientId, actorRole: 'patient', action: 'appointment.requested',
    entityType: 'Appointment', entityId: appointment._id.toString(),
  });

  // appointment.doctorId is a DoctorProfile id, not a socket room key — look up the
  // doctor's own User id to emit to the room the doctor's browser actually joins.
  const doctorProfile = await DoctorProfile.findById(appointment.doctorId);
  if (doctorProfile) emitAppointmentUpdate(doctorProfile.userId.toString(), appointment);
  emitAppointmentUpdate(patientId, appointment);

  return appointment;
}

export async function appendTimelineEntry(
  appointmentId: string,
  status: AppointmentStatus,
  by: string,
  extra: Record<string, unknown> = {}
): Promise<IAppointment | null> {
  return Appointment.findByIdAndUpdate(
    appointmentId,
    {
      $set: { status, ...extra },
      $push: { timeline: { status, at: new Date(), by: new Types.ObjectId(by) } },
    },
    { new: true }
  );
}

export async function confirmAppointment(appointmentId: string, doctorUserId: string): Promise<IAppointment> {
  const doctorProfile = await DoctorProfile.findOne({ userId: doctorUserId });
  if (!doctorProfile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');

  const appointment = await Appointment.findOne({ _id: appointmentId, doctorId: doctorProfile._id });
  if (!appointment) throw new AppError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');

  const updated = await appendTimelineEntry(appointmentId, 'confirmed', doctorUserId);
  await logAudit({
    actorId: doctorUserId, actorRole: 'doctor', action: 'appointment.confirmed',
    entityType: 'Appointment', entityId: appointmentId,
  });
  // doctorUserId here is already the doctor's own User id (it was used above to look up
  // doctorProfile via userId), so no DoctorProfile.userId re-lookup is needed for this side.
  emitAppointmentUpdate(doctorUserId, updated!);
  emitAppointmentUpdate(updated!.patientId.toString(), updated!);
  return updated!;
}

export async function rejectAppointment(appointmentId: string, doctorUserId: string, reason: string): Promise<IAppointment> {
  const doctorProfile = await DoctorProfile.findOne({ userId: doctorUserId });
  if (!doctorProfile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');

  const appointment = await Appointment.findOne({ _id: appointmentId, doctorId: doctorProfile._id });
  if (!appointment) throw new AppError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');

  const updated = await appendTimelineEntry(appointmentId, 'rejected', doctorUserId, { rejectionReason: reason });
  await releaseSlotLock(appointment.doctorId.toString(), appointment.slotStart.toISOString());
  await logAudit({
    actorId: doctorUserId, actorRole: 'doctor', action: 'appointment.rejected',
    entityType: 'Appointment', entityId: appointmentId, meta: { reason },
  });
  // doctorUserId here is already the doctor's own User id (looked up above via userId), so
  // no DoctorProfile.userId re-lookup is needed for this side.
  emitAppointmentUpdate(doctorUserId, updated!);
  emitAppointmentUpdate(updated!.patientId.toString(), updated!);
  return updated!;
}

const CANCEL_CUTOFF_MS = 2 * 60 * 60 * 1000;

export async function cancelAppointment(appointmentId: string, patientUserId: string): Promise<IAppointment> {
  const appointment = await Appointment.findOne({ _id: appointmentId, patientId: patientUserId });
  if (!appointment) throw new AppError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');

  if (appointment.slotStart.getTime() - Date.now() < CANCEL_CUTOFF_MS) {
    throw new AppError(400, 'Cannot cancel within 2 hours of the appointment', 'CANCEL_CUTOFF');
  }

  const updated = await appendTimelineEntry(appointmentId, 'cancelled', patientUserId);
  await releaseSlotLock(appointment.doctorId.toString(), appointment.slotStart.toISOString());
  await logAudit({
    actorId: patientUserId, actorRole: 'patient', action: 'appointment.cancelled',
    entityType: 'Appointment', entityId: appointmentId,
  });
  // appointment.doctorId is a DoctorProfile id, not a socket room key — look up the
  // doctor's own User id to emit to the room the doctor's browser actually joins.
  const doctorProfile = await DoctorProfile.findById(appointment.doctorId);
  if (doctorProfile) emitAppointmentUpdate(doctorProfile.userId.toString(), updated!);
  emitAppointmentUpdate(patientUserId, updated!);
  return updated!;
}
