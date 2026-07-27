import { Types } from 'mongoose';
import { Appointment, IAppointment, AppointmentStatus } from '../../models/Appointment';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/audit.service';
import { acquireSlotLock, releaseSlotLock } from './slotLock';
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
