import cron from 'node-cron';
import { Appointment } from '../models/Appointment';
import { DoctorProfile } from '../models/DoctorProfile';
import { User } from '../models/User';
import { sendAppointmentEmail } from '../lib/mailer';
import { logger } from '../lib/logger';

const REMINDER_WINDOW_START_MS = 23 * 60 * 60 * 1000;
const REMINDER_WINDOW_END_MS = 25 * 60 * 60 * 1000;

export async function runReminderScan(): Promise<number> {
  const now = Date.now();
  const windowStart = new Date(now + REMINDER_WINDOW_START_MS);
  const windowEnd = new Date(now + REMINDER_WINDOW_END_MS);

  const dueAppointments = await Appointment.find({
    status: 'confirmed',
    slotStart: { $gte: windowStart, $lte: windowEnd },
    reminderSentAt: { $exists: false },
  });

  let sentCount = 0;
  for (const appointment of dueAppointments) {
    const [patient, doctorProfile] = await Promise.all([
      User.findById(appointment.patientId),
      DoctorProfile.findById(appointment.doctorId),
    ]);
    if (!patient) continue;

    // The patient booked a person, not a clinic — the reminder must name the doctor.
    const doctorUser = doctorProfile ? await User.findById(doctorProfile.userId) : null;

    // Awaited on purpose: this runs on a background cron tick, not a request path, and
    // sentCount is only meaningful if the send attempt has actually completed.
    await sendAppointmentEmail(patient.email, 'reminder', {
      doctorName: doctorUser?.name ?? 'your doctor',
      slotStart: appointment.slotStart.toISOString(),
    });
    appointment.reminderSentAt = new Date();
    await appointment.save();
    sentCount++;
  }

  return sentCount;
}

export function startReminderCron(): void {
  cron.schedule('0 * * * *', () => {
    runReminderScan().catch((err) => logger.error(err, 'reminder scan failed'));
  });
}
