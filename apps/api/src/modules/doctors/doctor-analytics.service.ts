import { Types } from 'mongoose';
import { Appointment, AppointmentStatus } from '../../models/Appointment';
import { Rating } from '../../models/Rating';
import { DoctorProfile } from '../../models/DoctorProfile';
import { AppError } from '../../lib/errors';

const WINDOW_DAYS = 90;
const WEEK_FORMAT = '%G-W%V'; // ISO week-year + ISO week number, same $dateToString family analytics.service.ts uses
const DISCLAIMER =
  'Estimated earnings are projected from completed appointments x your current consultation fee. ' +
  'MedLink has no payment processing -- this is not a record of money actually received.';

export interface DoctorAnalyticsSummary {
  windowDays: number;
  disclaimer: string;
  earningsByWeek: { weekStart: string; completedCount: number; estimatedEarnings: number }[];
  appointmentBreakdown: {
    completed: number; cancelled: number; noShow: number; rejected: number;
    requested: number; confirmed: number;
  };
  noShowCancellationRate: number;
  ratingTrend: { weekStart: string; avgScore: number; count: number }[];
  currentRating: { avgRating: number; ratingCount: number };
  patientVolume: { totalDistinctPatients: number; newPatients: number; returningPatients: number };
}

const BREAKDOWN_KEYS: Record<AppointmentStatus, keyof DoctorAnalyticsSummary['appointmentBreakdown']> = {
  completed: 'completed', cancelled: 'cancelled', no_show: 'noShow',
  rejected: 'rejected', requested: 'requested', confirmed: 'confirmed',
};

export async function getDoctorAnalytics(doctorId: Types.ObjectId): Promise<DoctorAnalyticsSummary> {
  const doctorProfile = await DoctorProfile.findById(doctorId);
  if (!doctorProfile) throw new AppError(404, 'Doctor profile not found', 'DOCTOR_PROFILE_NOT_FOUND');

  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const earningsAgg = await Appointment.aggregate<{ _id: string; completedCount: number }>([
    { $match: { doctorId, status: 'completed', slotStart: { $gte: windowStart } } },
    { $group: { _id: { $dateToString: { format: WEEK_FORMAT, date: '$slotStart' } }, completedCount: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const earningsByWeek = earningsAgg.map((row) => ({
    weekStart: row._id,
    completedCount: row.completedCount,
    estimatedEarnings: row.completedCount * doctorProfile.consultationFee,
  }));

  const breakdownAgg = await Appointment.aggregate<{ _id: AppointmentStatus; count: number }>([
    { $match: { doctorId, slotStart: { $gte: windowStart } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const appointmentBreakdown = { completed: 0, cancelled: 0, noShow: 0, rejected: 0, requested: 0, confirmed: 0 };
  for (const row of breakdownAgg) appointmentBreakdown[BREAKDOWN_KEYS[row._id]] = row.count;
  const terminal = appointmentBreakdown.completed + appointmentBreakdown.cancelled
    + appointmentBreakdown.noShow + appointmentBreakdown.rejected;
  const noShowCancellationRate = terminal > 0
    ? Math.round(((appointmentBreakdown.cancelled + appointmentBreakdown.noShow) / terminal) * 1000) / 10
    : 0;

  const ratingTrendAgg = await Rating.aggregate<{ _id: string; avgScore: number; count: number }>([
    { $match: { doctorId, createdAt: { $gte: windowStart } } },
    { $group: { _id: { $dateToString: { format: WEEK_FORMAT, date: '$createdAt' } }, avgScore: { $avg: '$score' }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const ratingTrend = ratingTrendAgg.map((row) => ({
    weekStart: row._id,
    avgScore: Math.round(row.avgScore * 10) / 10,
    count: row.count,
  }));

  const distinctPatientIds = await Appointment.distinct('patientId', { doctorId, slotStart: { $gte: windowStart } });
  let newPatients = 0;
  for (const patientId of distinctPatientIds) {
    const hadEarlier = await Appointment.exists({ doctorId, patientId, slotStart: { $lt: windowStart } });
    if (!hadEarlier) newPatients += 1;
  }
  const patientVolume = {
    totalDistinctPatients: distinctPatientIds.length,
    newPatients,
    returningPatients: distinctPatientIds.length - newPatients,
  };

  return {
    windowDays: WINDOW_DAYS,
    disclaimer: DISCLAIMER,
    earningsByWeek,
    appointmentBreakdown,
    noShowCancellationRate,
    ratingTrend,
    currentRating: { avgRating: doctorProfile.avgRating, ratingCount: doctorProfile.ratingCount },
    patientVolume,
  };
}
