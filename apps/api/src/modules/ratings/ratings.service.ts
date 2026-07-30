import { Appointment } from '../../models/Appointment';
import { DoctorProfile } from '../../models/DoctorProfile';
import { Rating, IRating } from '../../models/Rating';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/audit.service';

export async function createRating(
  patientId: string,
  appointmentId: string,
  score: number,
  text?: string
): Promise<IRating> {
  const appointment = await Appointment.findOne({ _id: appointmentId, patientId, status: 'completed' });
  if (!appointment) throw new AppError(404, 'Completed appointment not found', 'APPOINTMENT_NOT_FOUND');

  let rating: IRating;
  try {
    rating = await Rating.create({ doctorId: appointment.doctorId, patientId, appointmentId, score, text });
  } catch (err) {
    // E11000 duplicate key on the unique appointmentId index -- catching this (rather
    // than a check-then-create findOne) is what makes double-rating race-safe: two
    // concurrent requests for the same appointment can both pass the findOne above,
    // but only one Rating.create ever succeeds.
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: number }).code === 11000) {
      throw new AppError(409, 'This appointment has already been rated', 'ALREADY_RATED');
    }
    throw err;
  }

  // Recompute avgRating/ratingCount as a fresh aggregate over every Rating for this
  // doctor, rather than an incremental running average -- an incremental update is not
  // idempotent under retries and drifts under any missed write, whereas a full aggregate
  // always reflects exactly what's stored in the Rating collection.
  const [agg] = await Rating.aggregate<{ _id: unknown; avg: number; count: number }>([
    { $match: { doctorId: appointment.doctorId } },
    { $group: { _id: '$doctorId', avg: { $avg: '$score' }, count: { $sum: 1 } } },
  ]);
  await DoctorProfile.findByIdAndUpdate(appointment.doctorId, {
    avgRating: agg ? Math.round(agg.avg * 10) / 10 : 0,
    ratingCount: agg ? agg.count : 0,
  });

  await logAudit({
    actorId: patientId,
    actorRole: 'patient',
    action: 'rating.created',
    entityType: 'Rating',
    entityId: rating._id.toString(),
    meta: { doctorId: appointment.doctorId.toString(), score },
  });

  return rating;
}

export async function listRatingsForDoctor(
  doctorId: string,
  page: number,
  limit: number
): Promise<{ items: { score: number; text?: string; createdAt: Date }[]; total: number; page: number; limit: number }> {
  const cappedLimit = Math.min(50, limit);
  const [items, total] = await Promise.all([
    Rating.find({ doctorId }, 'score text createdAt -_id')
      .sort({ createdAt: -1 })
      .skip((page - 1) * cappedLimit)
      .limit(cappedLimit),
    Rating.countDocuments({ doctorId }),
  ]);
  return { items, total, page, limit: cappedLimit };
}
