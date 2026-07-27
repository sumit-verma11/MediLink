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

  try {
    const appointment = await Appointment.create({
      patientId: new Types.ObjectId(patientId),
      doctorId: new Types.ObjectId(input.doctorId),
      slotStart: input.slotStart,
      slotEnd: input.slotEnd,
      status: 'requested',
      symptomSummary: input.symptomSummary,
      triageSessionId: input.triageSessionId ? new Types.ObjectId(input.triageSessionId) : undefined,
      timeline: [{ status: 'requested', at: new Date(), by: new Types.ObjectId(patientId) }],
    });

    await logAudit({
      actorId: patientId, actorRole: 'patient', action: 'appointment.requested',
      entityType: 'Appointment', entityId: appointment._id.toString(),
    });

    return appointment;
  } catch (err) {
    // The Mongo write failed (including a partial-unique-index collision that slipped
    // past the Redis lock, e.g. a pre-existing active appointment from before this lock
    // existed) — release the lock immediately so the slot isn't stuck held for 5 minutes
    // over a booking that never actually succeeded.
    await releaseSlotLock(input.doctorId, slotStartISO);
    if ((err as { code?: number }).code === 11000) {
      throw new AppError(409, 'Slot is no longer available', 'SLOT_UNAVAILABLE');
    }
    throw err;
  }
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
