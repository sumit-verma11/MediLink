import { Types, FilterQuery } from 'mongoose';
import { Appointment, IAppointment, AppointmentStatus } from '../../models/Appointment';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/audit.service';
import { acquireSlotLock, releaseSlotLock } from './slotLock';
import { generateSlotsForDoctor } from './slotService';
import { DoctorProfile } from '../../models/DoctorProfile';
import { emitAppointmentUpdate } from '../../lib/socket';
import { sendAppointmentEmail } from '../../lib/mailer';
import { User } from '../../models/User';
import type { CreateAppointmentInput } from '@medlink/shared';

export async function createAppointment(patientId: string, input: CreateAppointmentInput): Promise<IAppointment> {
  // The requested interval must correspond to a slot this doctor actually offers.
  // Without this check any {doctorId, slotStart, slotEnd} triple booked successfully,
  // which made AvailabilityRule/BlockedDate advisory rather than enforced.
  const doctorProfile = await DoctorProfile.findById(input.doctorId);
  if (!doctorProfile || doctorProfile.verificationStatus !== 'approved') {
    throw new AppError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
  }

  // generateSlotsForDoctor already subtracts blocked dates, already-booked slots and
  // past times, so an exact start+end match against its output is a complete check.
  const candidateSlots = await generateSlotsForDoctor(input.doctorId, input.slotStart, 1);
  const slotIsOffered = candidateSlots.some(
    (slot) =>
      slot.start.getTime() === input.slotStart.getTime() && slot.end.getTime() === input.slotEnd.getTime()
  );
  if (!slotIsOffered) {
    // Two very different reasons land here, and they are not the same error to a caller:
    // the slot may be a real slot that someone else has already taken (a lost race — 409,
    // "try another slot"), or it may be a time this doctor never offers (400, a bad
    // request). generateSlotsForDoctor subtracts booked slots, so disambiguate here.
    const alreadyBooked = await Appointment.exists({
      doctorId: input.doctorId,
      slotStart: input.slotStart,
      status: { $in: ['requested', 'confirmed'] },
    });
    if (alreadyBooked) {
      throw new AppError(409, 'Slot is no longer available', 'SLOT_UNAVAILABLE');
    }
    throw new AppError(400, 'Requested slot is not available for this doctor', 'SLOT_NOT_AVAILABLE');
  }

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

  // appointment.doctorId is a DoctorProfile id, not a socket room key — the doctor's own
  // User id is the room their browser is placed in.
  emitAppointmentUpdate(doctorProfile.userId.toString(), appointment);
  emitAppointmentUpdate(patientId, appointment);

  const [patientUser, doctorUser] = await Promise.all([
    User.findById(patientId),
    User.findById(doctorProfile.userId),
  ]);

  // Email is a best-effort side effect that never rejects (sendAppointmentEmail swallows
  // its own errors), so it is deliberately not awaited: the HTTP response should not wait
  // on an SMTP round-trip.
  if (patientUser) {
    void sendAppointmentEmail(patientUser.email, 'requested', {
      doctorName: doctorUser?.name ?? 'the doctor',
      slotStart: appointment.slotStart.toISOString(),
    });
  }
  // Notifications both ways: the doctor is told a request is waiting on their dashboard.
  if (doctorUser) {
    void sendAppointmentEmail(doctorUser.email, 'new_request', {
      patientName: patientUser?.name,
      slotStart: appointment.slotStart.toISOString(),
    });
  }

  return appointment;
}

export async function appendTimelineEntry(
  appointmentId: string,
  status: AppointmentStatus,
  by: string,
  extra: Record<string, unknown> = {},
  extraFilter: FilterQuery<IAppointment> = {}
): Promise<IAppointment | null> {
  // The status transition and its guard (ownership + current status) happen in one
  // findOneAndUpdate so a stale dashboard cannot move an appointment out of a status it
  // is no longer in — which, for confirm, would otherwise collide with the partial unique
  // {doctorId, slotStart} index and surface as a raw E11000 / HTTP 500.
  return Appointment.findOneAndUpdate(
    { _id: appointmentId, ...extraFilter },
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

  const updated = await appendTimelineEntry(appointmentId, 'confirmed', doctorUserId, {}, {
    doctorId: doctorProfile._id,
    status: 'requested',
  });
  if (!updated) {
    // The atomic update matched nothing: either this doctor has no such appointment (404)
    // or it exists but has already left 'requested' (409).
    const exists = await Appointment.exists({ _id: appointmentId, doctorId: doctorProfile._id });
    if (exists) throw new AppError(409, 'Appointment is no longer pending', 'INVALID_STATUS_TRANSITION');
    throw new AppError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
  }

  await logAudit({
    actorId: doctorUserId, actorRole: 'doctor', action: 'appointment.confirmed',
    entityType: 'Appointment', entityId: appointmentId,
  });
  // doctorUserId here is already the doctor's own User id (it was used above to look up
  // doctorProfile via userId), so no DoctorProfile.userId re-lookup is needed for this side.
  emitAppointmentUpdate(doctorUserId, updated);
  emitAppointmentUpdate(updated.patientId.toString(), updated);

  const [patientUser, doctorUser] = await Promise.all([
    User.findById(updated.patientId),
    User.findById(doctorProfile.userId),
  ]);
  if (patientUser) {
    void sendAppointmentEmail(patientUser.email, 'confirmed', {
      doctorName: doctorUser?.name ?? 'your doctor',
      slotStart: updated.slotStart.toISOString(),
    });
  }

  return updated;
}

export async function rejectAppointment(appointmentId: string, doctorUserId: string, reason: string): Promise<IAppointment> {
  const doctorProfile = await DoctorProfile.findOne({ userId: doctorUserId });
  if (!doctorProfile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');

  const updated = await appendTimelineEntry(appointmentId, 'rejected', doctorUserId, { rejectionReason: reason }, {
    doctorId: doctorProfile._id,
    status: 'requested',
  });
  if (!updated) {
    const exists = await Appointment.exists({ _id: appointmentId, doctorId: doctorProfile._id });
    if (exists) throw new AppError(409, 'Appointment is no longer pending', 'INVALID_STATUS_TRANSITION');
    throw new AppError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
  }

  await releaseSlotLock(updated.doctorId.toString(), updated.slotStart.toISOString());
  await logAudit({
    actorId: doctorUserId, actorRole: 'doctor', action: 'appointment.rejected',
    entityType: 'Appointment', entityId: appointmentId, meta: { reason },
  });
  // doctorUserId here is already the doctor's own User id (looked up above via userId), so
  // no DoctorProfile.userId re-lookup is needed for this side.
  emitAppointmentUpdate(doctorUserId, updated);
  emitAppointmentUpdate(updated.patientId.toString(), updated);

  const [patientUser, doctorUser] = await Promise.all([
    User.findById(updated.patientId),
    User.findById(doctorProfile.userId),
  ]);
  if (patientUser) {
    void sendAppointmentEmail(patientUser.email, 'rejected', {
      doctorName: doctorUser?.name ?? 'your doctor',
      slotStart: updated.slotStart.toISOString(),
      reason,
    });
  }

  return updated;
}

const CANCEL_CUTOFF_MS = 2 * 60 * 60 * 1000;

export async function cancelAppointment(appointmentId: string, patientUserId: string): Promise<IAppointment> {
  // Ownership, cancellable status AND the 2-hour cutoff are all expressed as filter
  // conditions so the transition is a single atomic write.
  const updated = await appendTimelineEntry(appointmentId, 'cancelled', patientUserId, {}, {
    patientId: patientUserId,
    status: { $in: ['requested', 'confirmed'] },
    slotStart: { $gt: new Date(Date.now() + CANCEL_CUTOFF_MS) },
  });
  if (!updated) {
    // Nothing matched — read back once to report the specific reason.
    const existing = await Appointment.findOne({ _id: appointmentId, patientId: patientUserId });
    if (!existing) throw new AppError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
    if (existing.slotStart.getTime() - Date.now() < CANCEL_CUTOFF_MS) {
      throw new AppError(400, 'Cannot cancel within 2 hours of the appointment', 'CANCEL_CUTOFF');
    }
    throw new AppError(409, 'Appointment can no longer be cancelled', 'INVALID_STATUS_TRANSITION');
  }

  await releaseSlotLock(updated.doctorId.toString(), updated.slotStart.toISOString());
  await logAudit({
    actorId: patientUserId, actorRole: 'patient', action: 'appointment.cancelled',
    entityType: 'Appointment', entityId: appointmentId,
  });
  // appointment.doctorId is a DoctorProfile id, not a socket room key — look up the
  // doctor's own User id to emit to the room the doctor's browser actually joins.
  const doctorProfile = await DoctorProfile.findById(updated.doctorId);
  if (doctorProfile) emitAppointmentUpdate(doctorProfile.userId.toString(), updated);
  emitAppointmentUpdate(patientUserId, updated);
  return updated;
}
