import { Types } from 'mongoose';
import { AvailabilityRule } from '../../models/AvailabilityRule';
import { BlockedDate } from '../../models/BlockedDate';
import { Appointment } from '../../models/Appointment';

export interface Slot {
  start: Date;
  end: Date;
}

const ACTIVE_STATUSES = ['requested', 'confirmed'];

function parseTimeToMinutes(hhmm: string): number {
  const parts = hhmm.split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  return hours * 60 + minutes;
}

function startOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function generateSlotsForDoctor(doctorId: string, fromDate: Date, days: number): Promise<Slot[]> {
  const rangeStart = startOfUTCDay(fromDate);
  const rangeEnd = new Date(rangeStart.getTime() + days * 24 * 60 * 60 * 1000);

  const [rules, blockedDates, bookedAppointments] = await Promise.all([
    AvailabilityRule.find({
      doctorId: new Types.ObjectId(doctorId),
      validFrom: { $lte: rangeEnd },
      validTo: { $gte: rangeStart },
    }),
    BlockedDate.find({ doctorId: new Types.ObjectId(doctorId), date: { $gte: rangeStart, $lt: rangeEnd } }),
    Appointment.find({
      doctorId: new Types.ObjectId(doctorId),
      status: { $in: ACTIVE_STATUSES },
      slotStart: { $gte: rangeStart, $lt: rangeEnd },
    }),
  ]);

  const blockedDateKeys = new Set(blockedDates.map((b) => startOfUTCDay(b.date).getTime()));
  const bookedStartTimes = new Set(bookedAppointments.map((a) => a.slotStart.getTime()));

  const rulesByDayOfWeek = new Map<number, typeof rules>();
  for (const rule of rules) {
    const existing = rulesByDayOfWeek.get(rule.dayOfWeek) ?? [];
    existing.push(rule);
    rulesByDayOfWeek.set(rule.dayOfWeek, existing);
  }

  const slots: Slot[] = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const day = new Date(rangeStart.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    if (blockedDateKeys.has(day.getTime())) continue;

    const dayOfWeek = day.getUTCDay();
    const rulesForDay = rulesByDayOfWeek.get(dayOfWeek) ?? [];

    for (const rule of rulesForDay) {
      if (rule.validFrom > day || rule.validTo < day) continue;

      const startMinutes = parseTimeToMinutes(rule.startTime);
      const endMinutes = parseTimeToMinutes(rule.endTime);

      for (let minutes = startMinutes; minutes + rule.slotMinutes <= endMinutes; minutes += rule.slotMinutes) {
        const slotStart = new Date(day.getTime() + minutes * 60 * 1000);
        const slotEnd = new Date(slotStart.getTime() + rule.slotMinutes * 60 * 1000);
        // Today's range starts at 00:00 UTC, so the first day of any generation window
        // contains slots that have already passed. They are not bookable (createAppointment
        // rejects a past slotStart), so they must not be offered.
        if (slotStart.getTime() <= Date.now()) continue;
        if (bookedStartTimes.has(slotStart.getTime())) continue;
        slots.push({ start: slotStart, end: slotEnd });
      }
    }
  }

  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}
