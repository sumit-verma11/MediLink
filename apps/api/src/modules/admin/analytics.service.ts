import { User } from '../../models/User';
import { Appointment } from '../../models/Appointment';
import { DoctorProfile } from '../../models/DoctorProfile';
import { TriageSession } from '../../models/TriageSession';

export interface AnalyticsSummary {
  totalRegistrations: { patients: number; doctors: number; labs: number };
  appointmentsPerDay: { date: string; count: number }[];
  topSpecialties: { specialty: string; count: number }[];
  triageToBookingConversion: { totalSessions: number; sessionsWithBooking: number; conversionRate: number };
}

export async function getAnalytics(): Promise<AnalyticsSummary> {
  const [patients, doctors, labs] = await Promise.all([
    User.countDocuments({ role: 'patient' }),
    User.countDocuments({ role: 'doctor' }),
    User.countDocuments({ role: 'lab' }),
  ]);

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const appointmentsPerDayAgg = await Appointment.aggregate<{ _id: string; count: number }>([
    { $match: { slotStart: { $gte: fourteenDaysAgo } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$slotStart' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const appointmentsPerDay = appointmentsPerDayAgg.map((row) => ({ date: row._id, count: row.count }));

  // `DoctorProfile.collection.name` (rather than a hardcoded 'doctorprofiles') keeps this
  // aggregation correct even if the model's collection naming ever changes.
  const topSpecialtiesAgg = await Appointment.aggregate<{ _id: string; count: number }>([
    { $lookup: { from: DoctorProfile.collection.name, localField: 'doctorId', foreignField: '_id', as: 'doctor' } },
    { $unwind: '$doctor' },
    { $unwind: '$doctor.specialties' },
    { $group: { _id: '$doctor.specialties', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);
  const topSpecialties = topSpecialtiesAgg.map((row) => ({ specialty: row._id, count: row.count }));

  const totalSessions = await TriageSession.countDocuments();
  // Count DISTINCT triage sessions that led to a booking, not the number of appointments
  // carrying a triageSessionId -- a single session can produce more than one booked
  // appointment (e.g. the patient books, cancels, then books again with the same
  // triageSessionId attached), and counting appointments would let sessionsWithBooking
  // exceed totalSessions, pushing conversionRate above 100%.
  const sessionsWithBooking = (
    await Appointment.distinct('triageSessionId', { triageSessionId: { $exists: true } })
  ).length;
  const conversionRate = totalSessions > 0 ? Math.round((sessionsWithBooking / totalSessions) * 1000) / 10 : 0;

  return {
    totalRegistrations: { patients, doctors, labs },
    appointmentsPerDay,
    topSpecialties,
    triageToBookingConversion: { totalSessions, sessionsWithBooking, conversionRate },
  };
}
